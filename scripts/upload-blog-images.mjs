import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HeadObjectCommand, NotFound, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const sourceDir = path.join(projectRoot, 'blog/assets/posts')
const manifestPath = path.join(projectRoot, '.cache/uploaded-media.json')
const imageDirectories = new Set(['thumbnails', 'content'])
const supportedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const thumbnailWidth = 1200
const thumbnailHeight = 630
const contentMaxWidth = 1920
const webpQuality = 85

async function loadEnvFile(filename) {
  try {
    const envText = await readFile(path.join(projectRoot, filename), 'utf8')

    for (const line of envText.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)

      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
}

function requireEnv(name) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

async function listImageFiles(directory, relativeDirectory = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue
    }

    const relativePath = path.posix.join(relativeDirectory, entry.name)
    const absolutePath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...await listImageFiles(absolutePath, relativePath))
    } else if (supportedExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push({ relativePath, absolutePath })
    }
  }

  return files
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { version: 1, buckets: {} }
    }

    throw error
  }
}

async function writeManifest(manifest) {
  await mkdir(path.dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

async function objectExists(client, bucket, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch (error) {
    if (error instanceof NotFound || error?.$metadata?.httpStatusCode === 404) {
      return false
    }

    throw error
  }
}

function toWebpPath(relativePath) {
  return relativePath.replace(/\.(?:jpe?g|png|webp)$/i, '.webp')
}

async function convertImage(file, imageDirectory) {
  const pipeline = sharp(file.absolutePath).rotate()

  if (imageDirectory === 'thumbnails') {
    pipeline.resize(thumbnailWidth, thumbnailHeight, {
      fit: 'cover',
      position: 'centre',
    })
  } else {
    pipeline.resize({
      width: contentMaxWidth,
      withoutEnlargement: true,
    })
  }

  return pipeline.webp({ quality: webpQuality }).toBuffer()
}

await loadEnvFile('.env.local')
await loadEnvFile('.env')

const dryRun = process.argv.includes('--dry-run')
const force = process.argv.includes('--force')
const accountId = requireEnv('R2_ACCOUNT_ID')
const bucket = requireEnv('R2_BUCKET_NAME')
const accessKeyId = requireEnv('R2_ACCESS_KEY_ID')
const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY')
const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`
const client = new S3Client({
  region: 'auto',
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
})

const manifest = await readManifest()
const bucketManifest = manifest.buckets[bucket] ||= { objectKeys: [] }
const uploadedKeys = new Set(bucketManifest.objectKeys)
const files = await listImageFiles(sourceDir)
const outputPaths = new Set()
let uploadedCount = 0
let skippedCount = 0

for (const file of files) {
  const imageDirectory = file.relativePath.split('/')[0]

  if (!imageDirectories.has(imageDirectory)) {
    throw new Error(
      `${file.relativePath} must be placed in thumbnails/ or content/.`,
    )
  }

  const outputPath = toWebpPath(file.relativePath)

  if (outputPaths.has(outputPath)) {
    throw new Error(
      `Multiple source images would create the same object: ${outputPath}`,
    )
  }

  outputPaths.add(outputPath)

  const objectKey = `blog/${outputPath}`

  if (!force && uploadedKeys.has(objectKey)) {
    skippedCount += 1
    console.log(`Skipped ${objectKey}: recorded as uploaded`)
    continue
  }

  if (!force && await objectExists(client, bucket, objectKey)) {
    uploadedKeys.add(objectKey)
    skippedCount += 1
    console.log(`Skipped ${objectKey}: already exists`)
    continue
  }

  if (dryRun) {
    await convertImage(file, imageDirectory)
    console.log(`Would convert ${file.relativePath} -> ${objectKey}`)
    continue
  }

  const body = await convertImage(file, imageDirectory)

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    Body: body,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable',
  }))

  uploadedKeys.add(objectKey)
  uploadedCount += 1
  console.log(`Converted and uploaded ${file.relativePath} -> ${objectKey}`)
}

if (!dryRun) {
  bucketManifest.objectKeys = [...uploadedKeys].sort()
  await writeManifest(manifest)
}

console.log(`Uploaded ${uploadedCount} blog images. Skipped ${skippedCount}.`)
