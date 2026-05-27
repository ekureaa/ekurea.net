import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const originalsDir = path.join(projectRoot, 'src/assets/photos/originals')
const outputDir = path.join(projectRoot, 'src/assets/photos/generated')
const photosJsonPath = path.join(projectRoot, 'src/data/photos.json')

const supportedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff'])

const variants = [
  {
    suffix: 'thumb',
    width: 900,
    quality: 78,
  },
  {
    suffix: 'large',
    width: 2560,
    quality: 82,
  },
]

function createSafeName(filename) {
  const parsed = path.parse(filename)

  return parsed.name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function createAltText(filename) {
  return path
    .parse(filename)
    .name.replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractDate(filename) {
  const match = path.parse(filename).name.match(/\d{4}-\d{2}-\d{2}/)

  return match?.[0]
}

async function fileExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function readPhotosJson() {
  try {
    return JSON.parse(await readFile(photosJsonPath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []
    }

    throw error
  }
}

async function writePhotosJson(photos) {
  await writeFile(photosJsonPath, `${JSON.stringify(photos, null, 2)}\n`)
}

function getSortValue(photo) {
  return photo.date || photo.image
}

function sortPhotosNewestFirst(photos) {
  return [...photos]
    .sort((a, b) => getSortValue(b).localeCompare(getSortValue(a)))
    .map((photo, index) => ({
      ...photo,
      id: index + 1,
    }))
}

async function buildPhoto(inputPath, filename) {
  const safeName = createSafeName(filename)

  if (!safeName) {
    console.warn(`Skipped ${filename}: filename must contain letters or numbers.`)
    return null
  }

  for (const variant of variants) {
    const outputName = `${safeName}-${variant.suffix}.webp`
    const outputPath = path.join(outputDir, outputName)

    if (await fileExists(outputPath)) {
      console.log(`${filename} -> generated/${outputName} skipped`)
      continue
    }

    const info = await sharp(inputPath)
      .rotate()
      .resize({
        width: variant.width,
        withoutEnlargement: true,
      })
      .webp({
        quality: variant.quality,
      })
      .toFile(outputPath)

    console.log(
      `${filename} -> generated/${outputName} (${info.width}x${info.height}, ${Math.round(
        info.size / 1024,
      )}KB)`,
    )
  }

  return {
    key: `photos/${safeName}`,
    image: `generated/${safeName}-thumb.webp`,
    alt: createAltText(filename) || safeName,
    date: extractDate(filename),
  }
}

await mkdir(originalsDir, { recursive: true })
await mkdir(outputDir, { recursive: true })

const files = await readdir(originalsDir)
const imageFiles = files.filter((filename) => supportedExtensions.has(path.extname(filename).toLowerCase()))

if (imageFiles.length === 0) {
  console.log('No source photos found in src/assets/photos/originals.')
  process.exit(0)
}

const builtPhotos = []

for (const filename of imageFiles) {
  const builtPhoto = await buildPhoto(path.join(originalsDir, filename), filename)

  if (builtPhoto) {
    builtPhotos.push(builtPhoto)
  }
}

const currentPhotos = await readPhotosJson()
const existingImages = new Set(currentPhotos.map((photo) => photo.image))
let addedCount = 0

const newPhotos = builtPhotos
  .filter((photo) => !existingImages.has(photo.image))
  .map((photo) => ({
    id: 0,
    key: photo.key,
    image: photo.image,
    alt: photo.alt,
    ...(photo.date ? { date: photo.date } : {}),
  }))

const sortedPhotos = sortPhotosNewestFirst([...currentPhotos, ...newPhotos])
await writePhotosJson(sortedPhotos)
addedCount = newPhotos.length

console.log(`Updated src/data/photos.json (${addedCount} added, ${sortedPhotos.length} total).`)
