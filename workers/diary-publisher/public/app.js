const form = document.querySelector('#diary-form')
const titleInput = document.querySelector('#title')
const bodyInput = document.querySelector('#body')
const photosInput = document.querySelector('#photos')
const photoSummary = document.querySelector('#photo-summary')
const photoPreview = document.querySelector('#photo-preview')
const publishButton = document.querySelector('#publish-button')
const status = document.querySelector('#status')

const maxPhotoCount = 4
const maxPhotoSize = 10 * 1024 * 1024
let previewUrls = []

function clearPreviewUrls() {
  previewUrls.forEach(url => URL.revokeObjectURL(url))
  previewUrls = []
}

function setStatus(message, kind = '') {
  status.textContent = message
  status.dataset.kind = kind
}

function updatePhotoPreview() {
  clearPreviewUrls()
  photoPreview.replaceChildren()

  const files = Array.from(photosInput.files || [])
  photoSummary.textContent = files.length
    ? `${files.length}枚選択中`
    : '写真は選択されていません'

  files.slice(0, maxPhotoCount).forEach((file) => {
    const url = URL.createObjectURL(file)
    previewUrls.push(url)
    const image = document.createElement('img')
    image.src = url
    image.alt = file.name
    photoPreview.append(image)
  })
}

photosInput.addEventListener('change', updatePhotoPreview)

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  setStatus('')

  const body = bodyInput.value.trim()
  const files = Array.from(photosInput.files || [])

  if (!body) {
    setStatus('本文を入力してください。', 'error')
    bodyInput.focus()
    return
  }

  if (files.length > maxPhotoCount) {
    setStatus(`写真は${maxPhotoCount}枚までです。`, 'error')
    return
  }

  if (files.some(file => file.size > maxPhotoSize)) {
    setStatus('写真は1枚10MB以下にしてください。', 'error')
    return
  }

  const data = new FormData()
  data.set('title', titleInput.value)
  data.set('body', bodyInput.value)
  files.forEach(file => data.append('photos', file, file.name))

  publishButton.disabled = true
  publishButton.textContent = '公開しています…'
  setStatus('画像と日記を保存しています。画面を閉じずにお待ちください。')

  try {
    const response = await fetch('/api/publish', {
      method: 'POST',
      body: data,
      headers: { accept: 'application/json' },
    })
    const contentType = response.headers.get('content-type') || ''

    if (!contentType.includes('application/json')) {
      throw new Error('ログインの有効期限が切れた可能性があります。画面を再読み込みしてください。')
    }

    const result = await response.json()

    if (!response.ok || !result.ok) {
      throw new Error(result.message || '公開に失敗しました。')
    }

    form.reset()
    updatePhotoPreview()
    status.dataset.kind = ''
    status.replaceChildren(
      document.createTextNode(`${result.message} `),
      Object.assign(document.createElement('a'), {
        href: result.pageUrl,
        textContent: '日記を開く',
      }),
    )
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '公開に失敗しました。', 'error')
  } finally {
    publishButton.disabled = false
    publishButton.textContent = '公開する'
  }
})

window.addEventListener('pagehide', clearPreviewUrls)
