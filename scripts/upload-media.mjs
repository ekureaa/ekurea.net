import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const generatedPhotosDir = path.join(projectRoot, 'src/assets/photos/generated')
const photosJsonPath = path.join(projectRoot, 'src/data/photos.json')

const contentTypes = new Map([
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
  ['.ogg', 'audio/ogg'],
  ['.png', 'image/png'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp'],
])

async function loadEnvFile(filename) {
  try {
    const envText = await readFile(path.join(projectRoot, filename), 'utf8')

    for (const line of envText.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)

      if (!match || process.env[match[1]] !== undefined) {
        continue
      }

      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
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

function photoKeyFromImage(image) {
  if (!image) {
    return ''
  }

  const basename = path.basename(image).replace(/-thumb\.[a-z0-9]+$/i, '')

  return basename ? `photos/${basename}` : ''
}

function getVariantObjectKey(photoKey, filename) {
  const suffixMatch = filename.match(/-(thumb|large)\.[a-z0-9]+$/i)
  const extension = path.extname(filename).toLowerCase()
  const suffix = suffixMatch?.[1]?.toLowerCase()

  if (!suffix) {
    return `photos/${filename}`
  }

  return `${photoKey}-${suffix}${extension}`
}

async function readPhotosJson() {
  return JSON.parse(await readFile(photosJsonPath, 'utf8'))
}

async function writePhotosJson(photos) {
  await writeFile(photosJsonPath, `${JSON.stringify(photos, null, 2)}\n`)
}

await loadEnvFile('.env.local')
await loadEnvFile('.env')

const dryRun = process.argv.includes('--dry-run')
const bucket = dryRun ? process.env.R2_BUCKET_NAME || '(dry-run bucket)' : requireEnv('R2_BUCKET_NAME')
let s3 = null

if (!dryRun) {
  const accountId = requireEnv('R2_ACCOUNT_ID')
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID')
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY')
  const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`

  s3 = new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })
}

const photos = await readPhotosJson()
const updatedPhotos = photos.map((photo) => ({
  ...photo,
  key: photo.key || photoKeyFromImage(photo.image || photo.thumb),
}))

let uploadedCount = 0

for (const photo of updatedPhotos) {
  if (!photo.key) {
    console.warn(`Skipped photo ${photo.id}: missing key and image.`)
    continue
  }

  for (const variant of ['thumb', 'large']) {
    const filename = `${path.basename(photo.key)}-${variant}.webp`
    const filePath = path.join(generatedPhotosDir, filename)
    const objectKey = getVariantObjectKey(photo.key, filename)
    const body = await readFile(filePath)
    const contentType = contentTypes.get(path.extname(filename).toLowerCase()) || 'application/octet-stream'

    if (dryRun) {
      console.log(`Would upload ${filePath.replace(`${projectRoot}/`, '')} -> ${objectKey}`)
    } else {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: body,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      )

      console.log(`Uploaded ${filePath.replace(`${projectRoot}/`, '')} -> ${objectKey}`)
    }

    uploadedCount += 1
  }
}

if (!dryRun) {
  await writePhotosJson(updatedPhotos)
}

console.log(`${dryRun ? 'Checked' : 'Uploaded'} ${uploadedCount} objects for R2 bucket ${bucket}.`)
