const form = document.querySelector('#diary-form')
const titleInput = document.querySelector('#title')
const bodyInput = document.querySelector('#body')
const blockEditor = document.querySelector('#block-editor')
const photoInput = document.querySelector('#photo-input')
const photoSummary = document.querySelector('#photo-summary')
const editTab = document.querySelector('#edit-tab')
const previewTab = document.querySelector('#preview-tab')
const editPanel = document.querySelector('#edit-panel')
const previewPanel = document.querySelector('#preview-panel')
const previewTitle = document.querySelector('#preview-title')
const previewBody = document.querySelector('#preview-body')
const embedDialog = document.querySelector('#embed-dialog')
const embedForm = document.querySelector('#embed-form')
const embedUrlInput = document.querySelector('#embed-url')
const embedError = document.querySelector('#embed-error')
const embedCancel = document.querySelector('#embed-cancel')
const entryDateInput = document.querySelector('#entry-date')
const draftStatusBadge = document.querySelector('#draft-status-badge')
const draftStateDetail = document.querySelector('#draft-state-detail')
const publishedLink = document.querySelector('#published-link')
const saveButton = document.querySelector('#save-button')
const readyButton = document.querySelector('#ready-button')
const manualPublishButton = document.querySelector('#manual-publish-button')
const status = document.querySelector('#status')

const maxBodyLength = 20_000
const maxPhotoCount = 4
const maxPhotoSize = 10 * 1024 * 1024
const maxTotalPhotoSize = 30 * 1024 * 1024
const maxEmbedCount = 10

let blocks = [createTextBlock()]
let activeTextSelection = null
let pendingPhotoInsertion = null
let pendingEmbedInsertion = null
let currentDraft = {
  exists: false,
  date: '',
  ready: false,
  status: 'draft',
  version: 0,
  afterCutoff: false,
  canEdit: true,
  canManualPublish: false,
  pageUrl: null,
}
let isDirty = false
let isBusy = false
let readyResetInFlight = false

function createId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createTextBlock(value = '', id = createId()) {
  return { type: 'text', id, value }
}

function createPhotoBlock(file) {
  return {
    type: 'photo',
    id: createId(),
    file,
    name: file.name,
    url: URL.createObjectURL(file),
  }
}

function createStoredPhotoBlock(id, url) {
  return {
    type: 'photo',
    id,
    file: null,
    name: '保存済みの写真',
    url,
  }
}

function createEmbedBlock(embed) {
  return {
    type: embed.type,
    id: createId(),
    url: embed.url,
    account: embed.account,
    videoId: embed.videoId,
  }
}

function setStatus(message, kind = '') {
  status.textContent = message
  status.dataset.kind = kind
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: 'application/json',
      ...(options.headers || {}),
    },
  })
  const contentType = response.headers.get('content-type') || ''

  if (!contentType.includes('application/json')) {
    throw new Error('ログインの有効期限が切れた可能性があります。画面を再読み込みしてください。')
  }

  const result = await response.json()

  if (!response.ok || !result.ok) {
    throw new Error(result.message || '処理に失敗しました。')
  }

  return result
}

function statusLabel(entry) {
  if (entry.status === 'published') {
    return '公開済み'
  }

  if (entry.status === 'publishing') {
    return '公開処理中'
  }

  if (entry.status === 'failed') {
    return '公開失敗'
  }

  if (entry.ready) {
    return '公開OK'
  }

  return entry.exists ? '下書き保存済み' : '未保存'
}

function formatDateTime(value) {
  if (!value) {
    return ''
  }

  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function updateDraftStateUI() {
  const entry = currentDraft
  const badgeState = entry.status === 'draft' && entry.ready ? 'ready' : entry.status
  draftStatusBadge.textContent = statusLabel(entry)
  draftStatusBadge.dataset.state = badgeState
  readyButton.setAttribute('aria-pressed', String(entry.ready))
  readyButton.textContent = `公開OK: ${entry.ready ? 'ON' : 'OFF'}`

  if (entry.status === 'published') {
    draftStateDetail.textContent = `${entry.date}の日記は公開済みです。`
  } else if (entry.status === 'publishing') {
    draftStateDetail.textContent = '公開処理中です。完了するまで編集せずにお待ちください。'
  } else if (entry.status === 'failed') {
    draftStateDetail.textContent = entry.lastError || '公開に失敗しました。内容を確認して手動公開してください。'
  } else if (entry.afterCutoff) {
    draftStateDetail.textContent = entry.ready
      ? '22時を過ぎています。保存だけでは公開されないため、手動公開してください。'
      : '22時を過ぎています。公開する場合は保存後に公開OKをONにし、手動公開してください。'
  } else if (entry.ready) {
    draftStateDetail.textContent = 'この保存内容を22時に自動公開します。内容を変更すると公開OKは外れます。'
  } else if (entry.exists) {
    draftStateDetail.textContent = `最終保存 ${formatDateTime(entry.updatedAt)}。確認できたら公開OKをONにしてください。`
  } else {
    draftStateDetail.textContent = 'まだ保存されていません。内容を書いたら下書きを保存してください。'
  }

  publishedLink.hidden = !entry.pageUrl
  publishedLink.replaceChildren()

  if (entry.pageUrl) {
    publishedLink.append(
      document.createTextNode('公開先: '),
      Object.assign(document.createElement('a'), {
        href: entry.pageUrl,
        textContent: '日記を開く',
      }),
    )
  }

  const editable = entry.canEdit && !isBusy
  entryDateInput.disabled = isBusy
  titleInput.disabled = !editable
  photoInput.disabled = !editable
  saveButton.disabled = !editable
  saveButton.textContent = isBusy ? '処理中…' : '下書きを保存'
  readyButton.disabled = isBusy || isDirty || !entry.exists || !entry.canEdit
  manualPublishButton.hidden = !entry.afterCutoff || !entry.exists || entry.status === 'published'
  manualPublishButton.disabled = isBusy || isDirty || !entry.canManualPublish
}

async function turnOffReadyForEdit() {
  if (!currentDraft.ready || readyResetInFlight || !currentDraft.exists) {
    return
  }

  const date = currentDraft.date
  const version = currentDraft.version
  readyResetInFlight = true
  currentDraft.ready = false
  currentDraft.canManualPublish = false
  updateDraftStateUI()

  try {
    const result = await requestJson('/api/draft/ready', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date, version, ready: false }),
    })

    if (currentDraft.date === date && currentDraft.version === version) {
      currentDraft = { ...currentDraft, ...result.entry, ready: false }
      updateDraftStateUI()
    }
  } catch (error) {
    setStatus(`公開OKを自動で外せませんでした。保存前に再読み込みしてください。${error instanceof Error ? ` ${error.message}` : ''}`, 'error')
  } finally {
    readyResetInFlight = false
  }
}

function markDirty() {
  if (!currentDraft.canEdit) {
    return
  }

  isDirty = true
  setStatus('未保存の変更があります。公開対象にする前に保存してください。')
  void turnOffReadyForEdit()
  updateDraftStateUI()
}

function serializeDraftBlocks() {
  return blocks.map((block) => {
    if (block.type === 'text') {
      return { id: block.id, type: 'text', value: block.value }
    }

    if (block.type === 'photo') {
      return { id: block.id, type: 'photo' }
    }

    return { id: block.id, type: block.type, url: block.url }
  })
}

function photoBlocks() {
  return blocks.filter(block => block.type === 'photo')
}

function embedBlocks() {
  return blocks.filter(block => block.type === 'youtube' || block.type === 'x')
}

function serializeBlocks() {
  return blocks
    .map((block) => {
      if (block.type === 'text') {
        return block.value
      }

      return block.type === 'photo'
        ? `[[diary-photo:${block.id}]]`
        : `[[diary-embed:${block.id}]]`
    })
    .join('\n\n')
    .trim()
}

function syncBody() {
  bodyInput.value = serializeBlocks()
}

function updatePhotoSummary() {
  const count = photoBlocks().length
  photoSummary.hidden = count === 0
  photoSummary.textContent = count ? `${count}枚挿入中（残り${maxPhotoCount - count}枚）` : ''
}

function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.max(textarea.scrollHeight, 96)}px`
}

function rememberSelection(block, textarea) {
  activeTextSelection = {
    blockId: block.id,
    start: textarea.selectionStart,
    end: textarea.selectionEnd,
  }
}

function mergeAdjacentTextBlocks() {
  const merged = []

  blocks.forEach((block) => {
    const previous = merged.at(-1)

    if (block.type === 'text' && previous?.type === 'text') {
      previous.value = [previous.value, block.value].filter(Boolean).join('\n\n')
      return
    }

    merged.push(block)
  })

  blocks = merged.length ? merged : [createTextBlock()]
}

function focusTextBlock(focusTarget) {
  if (!focusTarget) {
    return
  }

  requestAnimationFrame(() => {
    const textarea = blockEditor.querySelector(`[data-block-id="${focusTarget.blockId}"] textarea`)

    if (!(textarea instanceof HTMLTextAreaElement)) {
      return
    }

    const position = Math.min(focusTarget.position, textarea.value.length)
    textarea.focus()
    textarea.setSelectionRange(position, position)
    autoResizeTextarea(textarea)
  })
}

function makeActionButton(label, className, onClick, disabled = false) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  button.textContent = label
  button.disabled = disabled
  button.addEventListener('click', onClick)
  return button
}

function requestPhotoAt(block, textarea) {
  rememberSelection(block, textarea)
  pendingPhotoInsertion = { ...activeTextSelection }
  photoInput.click()
}

function parseEmbedUrl(value) {
  let url

  try {
    url = new URL(value.trim())
  } catch {
    return null
  }

  if (url.protocol !== 'https:') {
    return null
  }

  const youtubeHostname = url.hostname.toLowerCase().replace(/^www\./, '')
  const pathParts = url.pathname.split('/').filter(Boolean)
  let videoId = ''

  if (youtubeHostname === 'youtu.be') {
    videoId = pathParts[0] || ''
  } else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(youtubeHostname)) {
    videoId = url.searchParams.get('v')
      || (['embed', 'shorts', 'live'].includes(pathParts[0]) ? pathParts[1] || '' : '')
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return {
      type: 'youtube',
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    }
  }

  const xHostname = url.hostname.toLowerCase().replace(/^(?:www\.|mobile\.)/, '')
  const postMatch = url.pathname.match(/^\/([a-zA-Z0-9_]{1,15})\/status\/(\d+)/)

  if (['x.com', 'twitter.com'].includes(xHostname) && postMatch) {
    return {
      type: 'x',
      account: postMatch[1],
      url: `https://x.com/${postMatch[1]}/status/${postMatch[2]}`,
    }
  }

  return null
}

function openEmbedDialog(block, textarea) {
  if (embedBlocks().length >= maxEmbedCount) {
    setStatus(`YouTube・Xの埋め込みは合計${maxEmbedCount}件までです。`, 'error')
    return
  }

  rememberSelection(block, textarea)
  pendingEmbedInsertion = { ...activeTextSelection }
  embedUrlInput.value = ''
  embedError.textContent = ''
  embedDialog.showModal()
  requestAnimationFrame(() => embedUrlInput.focus())
}

function insertEmbedAt(insertion, embed) {
  const targetIndex = blocks.findIndex(block => block.id === insertion.blockId && block.type === 'text')

  if (targetIndex < 0) {
    setStatus('埋め込みを入れる位置を確認できませんでした。本文をタップしてからもう一度お試しください。', 'error')
    return false
  }

  const target = blocks[targetIndex]
  const position = Math.min(insertion.start, target.value.length)
  const before = createTextBlock(target.value.slice(0, position), target.id)
  const after = createTextBlock(target.value.slice(position))
  const embedBlock = createEmbedBlock(embed)

  blocks.splice(targetIndex, 1, before, embedBlock, after)
  pendingEmbedInsertion = null
  activeTextSelection = { blockId: after.id, start: 0, end: 0 }
  syncBody()
  markDirty()
  setStatus('')
  renderEditor({ blockId: after.id, position: 0 })
  return true
}

function createTextBlockElement(block, index) {
  const wrapper = document.createElement('section')
  wrapper.className = 'text-block'
  wrapper.dataset.blockId = block.id

  const textarea = document.createElement('textarea')
  textarea.className = 'block-text'
  textarea.value = block.value
  textarea.placeholder = index === 0 ? '今日のことを書く' : '続きを書く'
  textarea.setAttribute('aria-label', `本文 ${index + 1}`)
  textarea.disabled = !currentDraft.canEdit

  ;['focus', 'click', 'keyup', 'select'].forEach((eventName) => {
    textarea.addEventListener(eventName, () => rememberSelection(block, textarea))
  })

  textarea.addEventListener('input', () => {
    block.value = textarea.value
    rememberSelection(block, textarea)
    autoResizeTextarea(textarea)
    syncBody()
    markDirty()
  })

  textarea.addEventListener('paste', (event) => {
    const pastedText = event.clipboardData?.getData('text/plain') || ''
    const embed = parseEmbedUrl(pastedText)

    if (!embed || embedBlocks().length >= maxEmbedCount) {
      return
    }

    event.preventDefault()
    rememberSelection(block, textarea)
    insertEmbedAt(activeTextSelection, embed)
  })

  const actions = document.createElement('div')
  actions.className = 'insert-block-actions'
  const photoButton = makeActionButton(
    '＋ カーソル位置に写真',
    'insert-photo-button',
    () => requestPhotoAt(block, textarea),
    !currentDraft.canEdit || photoBlocks().length >= maxPhotoCount,
  )
  const embedButton = makeActionButton(
    '＋ YouTube・X',
    'insert-embed-button',
    () => openEmbedDialog(block, textarea),
    !currentDraft.canEdit || embedBlocks().length >= maxEmbedCount,
  )

  actions.append(photoButton, embedButton)
  wrapper.append(textarea, actions)
  requestAnimationFrame(() => autoResizeTextarea(textarea))
  return wrapper
}

function moveBlock(blockId, direction) {
  const index = blocks.findIndex(block => block.id === blockId)
  const targetIndex = index + direction

  if (index < 0 || targetIndex < 0 || targetIndex >= blocks.length) {
    return
  }

  const nextBlocks = [...blocks]
  ;[nextBlocks[index], nextBlocks[targetIndex]] = [nextBlocks[targetIndex], nextBlocks[index]]
  blocks = nextBlocks
  syncBody()
  markDirty()
  renderEditor()
}

function removeBlock(blockId) {
  const removedBlock = blocks.find(block => block.id === blockId)

  if (removedBlock?.type === 'photo' && removedBlock.file) {
    URL.revokeObjectURL(removedBlock.url)
  }

  blocks = blocks.filter(block => block.id !== blockId)
  mergeAdjacentTextBlocks()
  syncBody()
  markDirty()
  renderEditor()
}

function createBlockActions(block, index) {
  const actions = document.createElement('span')
  actions.className = 'block-actions'
  actions.append(
    makeActionButton('上へ', 'block-action', () => moveBlock(block.id, -1), !currentDraft.canEdit || index === 0),
    makeActionButton('下へ', 'block-action', () => moveBlock(block.id, 1), !currentDraft.canEdit || index === blocks.length - 1),
    makeActionButton('削除', 'block-action block-remove', () => removeBlock(block.id), !currentDraft.canEdit),
  )
  return actions
}

function createPhotoBlockElement(block, index) {
  const figure = document.createElement('figure')
  figure.className = 'photo-block'
  figure.dataset.blockId = block.id

  const image = document.createElement('img')
  image.src = block.url
  image.alt = block.name

  const details = document.createElement('figcaption')
  const name = document.createElement('span')
  name.textContent = block.name

  const actions = createBlockActions(block, index)

  details.append(name, actions)
  figure.append(image, details)
  return figure
}

function createEmbedBlockElement(block, index) {
  const element = document.createElement('section')
  element.className = `embed-block ${block.type === 'youtube' ? 'embed-block-youtube' : 'embed-block-x'}`
  element.dataset.blockId = block.id

  const icon = document.createElement('span')
  icon.className = 'embed-block-icon'
  icon.textContent = block.type === 'youtube' ? '▶' : 'X'
  icon.setAttribute('aria-hidden', 'true')

  const details = document.createElement('span')
  details.className = 'embed-block-details'
  const label = document.createElement('strong')
  label.textContent = block.type === 'youtube'
    ? 'YouTube動画'
    : `@${block.account} の投稿`
  const link = document.createElement('a')
  link.href = block.url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.textContent = block.url
  details.append(label, link)

  element.append(icon, details, createBlockActions(block, index))
  return element
}

function renderEditor(focusTarget) {
  blockEditor.replaceChildren()

  blocks.forEach((block, index) => {
    if (block.type === 'text') {
      blockEditor.append(createTextBlockElement(block, index))
    } else if (block.type === 'photo') {
      blockEditor.append(createPhotoBlockElement(block, index))
    } else {
      blockEditor.append(createEmbedBlockElement(block, index))
    }
  })

  updatePhotoSummary()
  focusTextBlock(focusTarget)
}

function insertSelectedPhotos(files) {
  const currentPhotos = photoBlocks()
  const remaining = maxPhotoCount - currentPhotos.length

  if (files.length > remaining) {
    setStatus(`写真は${maxPhotoCount}枚までです。あと${remaining}枚選べます。`, 'error')
    return
  }

  if (files.some(file => file.size <= 0 || file.size > maxPhotoSize)) {
    setStatus('写真は1枚10MB以下にしてください。', 'error')
    return
  }

  const totalSize = [...currentPhotos.map(block => block.file).filter(Boolean), ...files]
    .reduce((total, file) => total + file.size, 0)

  if (totalSize > maxTotalPhotoSize) {
    setStatus('写真の合計サイズは30MB以下にしてください。', 'error')
    return
  }

  const fallbackBlock = [...blocks].reverse().find(block => block.type === 'text')
  const insertion = pendingPhotoInsertion?.blockId
    ? pendingPhotoInsertion
    : {
        blockId: activeTextSelection?.blockId || fallbackBlock?.id,
        start: activeTextSelection?.start ?? fallbackBlock?.value.length ?? 0,
        end: activeTextSelection?.end ?? fallbackBlock?.value.length ?? 0,
      }
  const targetIndex = blocks.findIndex(block => block.id === insertion.blockId && block.type === 'text')

  if (targetIndex < 0) {
    setStatus('写真を入れる位置を確認できませんでした。本文をタップしてからもう一度お試しください。', 'error')
    return
  }

  const target = blocks[targetIndex]
  const position = Math.min(insertion.start, target.value.length)
  const before = createTextBlock(target.value.slice(0, position), target.id)
  const after = createTextBlock(target.value.slice(position))
  const inserted = [before]

  files.forEach((file, index) => {
    inserted.push(createPhotoBlock(file))

    if (index < files.length - 1) {
      inserted.push(createTextBlock())
    }
  })

  inserted.push(after)
  blocks.splice(targetIndex, 1, ...inserted)
  pendingPhotoInsertion = null
  activeTextSelection = { blockId: after.id, start: 0, end: 0 }
  syncBody()
  markDirty()
  setStatus('')
  renderEditor({ blockId: after.id, position: 0 })
}

function safePreviewUrl(value) {
  const trimmed = value.trim()

  if (trimmed.startsWith('#') || trimmed.startsWith('/')) {
    return trimmed
  }

  try {
    const url = new URL(trimmed)
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

function appendInlineMarkdown(parent, source) {
  let index = 0
  let plainText = ''

  const flushText = () => {
    if (plainText) {
      parent.append(document.createTextNode(plainText))
      plainText = ''
    }
  }

  while (index < source.length) {
    if (source[index] === '`') {
      const end = source.indexOf('`', index + 1)

      if (end > index + 1) {
        flushText()
        const code = document.createElement('code')
        code.textContent = source.slice(index + 1, end)
        parent.append(code)
        index = end + 1
        continue
      }
    }

    const strongMarker = source.startsWith('**', index)
      ? '**'
      : source.startsWith('__', index)
        ? '__'
        : null

    if (strongMarker) {
      const end = source.indexOf(strongMarker, index + 2)

      if (end > index + 2) {
        flushText()
        const strong = document.createElement('strong')
        appendInlineMarkdown(strong, source.slice(index + 2, end))
        parent.append(strong)
        index = end + 2
        continue
      }
    }

    if (source.startsWith('~~', index)) {
      const end = source.indexOf('~~', index + 2)

      if (end > index + 2) {
        flushText()
        const deleted = document.createElement('del')
        appendInlineMarkdown(deleted, source.slice(index + 2, end))
        parent.append(deleted)
        index = end + 2
        continue
      }
    }

    if (source[index] === '[') {
      const labelEnd = source.indexOf('](', index + 1)
      const urlEnd = labelEnd >= 0 ? source.indexOf(')', labelEnd + 2) : -1

      if (labelEnd > index + 1 && urlEnd > labelEnd + 2) {
        const href = safePreviewUrl(source.slice(labelEnd + 2, urlEnd))

        if (href) {
          flushText()
          const link = document.createElement('a')
          link.href = href
          link.rel = 'noopener noreferrer'
          link.target = '_blank'
          appendInlineMarkdown(link, source.slice(index + 1, labelEnd))
          parent.append(link)
          index = urlEnd + 1
          continue
        }
      }
    }

    if (source[index] === '*' || source[index] === '_') {
      const marker = source[index]
      const end = source.indexOf(marker, index + 1)

      if (end > index + 1) {
        flushText()
        const emphasis = document.createElement('em')
        appendInlineMarkdown(emphasis, source.slice(index + 1, end))
        parent.append(emphasis)
        index = end + 1
        continue
      }
    }

    plainText += source[index]
    index += 1
  }

  flushText()
}

function isBlockStart(line) {
  return /^(#{1,6})\s+/.test(line)
    || /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)
    || /^\s*>\s?/.test(line)
    || /^\s*([-+*]|\d+\.)\s+/.test(line)
    || /^\s*```/.test(line)
}

function renderMarkdown(container, markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (!line.trim()) {
      index += 1
      continue
    }

    const fence = line.match(/^\s*```\s*([^\s`]*)\s*$/)

    if (fence) {
      const codeLines = []
      index += 1

      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        codeLines.push(lines[index])
        index += 1
      }

      index += index < lines.length ? 1 : 0
      const pre = document.createElement('pre')
      const code = document.createElement('code')
      code.textContent = codeLines.join('\n')

      if (fence[1]) {
        code.dataset.language = fence[1]
      }

      pre.append(code)
      container.append(pre)
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)

    if (heading) {
      const level = heading[1].length
      const element = document.createElement(`h${level}`)
      appendInlineMarkdown(element, heading[2])
      container.append(element)
      index += 1
      continue
    }

    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      container.append(document.createElement('hr'))
      index += 1
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines = []

      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }

      const quote = document.createElement('blockquote')
      renderMarkdown(quote, quoteLines.join('\n'))
      container.append(quote)
      continue
    }

    const listMatch = line.match(/^\s*([-+*]|\d+\.)\s+(.+)$/)

    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[1])
      const list = document.createElement(ordered ? 'ol' : 'ul')

      while (index < lines.length) {
        const item = lines[index].match(/^\s*([-+*]|\d+\.)\s+(.+)$/)

        if (!item || /\d+\./.test(item[1]) !== ordered) {
          break
        }

        const listItem = document.createElement('li')
        appendInlineMarkdown(listItem, item[2])
        list.append(listItem)
        index += 1
      }

      container.append(list)
      continue
    }

    const paragraphLines = [line]
    index += 1

    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraphLines.push(lines[index])
      index += 1
    }

    const paragraph = document.createElement('p')
    paragraphLines.forEach((paragraphLine, lineIndex) => {
      const hardBreak = /\s{2}$/.test(paragraphLine)
      appendInlineMarkdown(paragraph, paragraphLine.replace(/\s{2}$/, ''))

      if (lineIndex < paragraphLines.length - 1) {
        paragraph.append(hardBreak ? document.createElement('br') : document.createTextNode(' '))
      }
    })
    container.append(paragraph)
  }
}

function fallbackTitle() {
  if (currentDraft.date) {
    const [year, month, day] = currentDraft.date.split('-')
    return `${year}年${Number(month)}月${Number(day)}日の日記`
  }

  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date())
  const value = type => parts.find(part => part.type === type)?.value || ''
  return `${value('year')}年${value('month')}月${value('day')}日の日記`
}

function createYouTubePreview(block) {
  const figure = document.createElement('figure')
  figure.className = 'preview-embed preview-youtube'
  const frame = document.createElement('div')
  frame.className = 'preview-youtube-frame'
  const iframe = document.createElement('iframe')
  iframe.src = `https://www.youtube-nocookie.com/embed/${block.videoId}`
  iframe.title = 'YouTube動画'
  iframe.loading = 'lazy'
  iframe.referrerPolicy = 'strict-origin-when-cross-origin'
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
  iframe.allowFullscreen = true
  const caption = document.createElement('figcaption')
  const link = document.createElement('a')
  link.href = block.url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.textContent = 'YouTubeで見る'
  caption.append(link)
  frame.append(iframe)
  figure.append(frame, caption)
  return figure
}

function createXPreview(block) {
  const wrapper = document.createElement('div')
  wrapper.className = 'preview-embed preview-x-post'
  const quote = document.createElement('blockquote')
  quote.className = 'twitter-tweet'
  quote.dataset.dnt = 'true'
  quote.dataset.theme = 'light'
  quote.dataset.lang = 'ja'
  const link = document.createElement('a')
  link.href = block.url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.textContent = `@${block.account} の投稿をXで見る`
  quote.append(link)
  wrapper.append(quote)
  return wrapper
}

function loadXWidgets(container) {
  const renderPosts = () => {
    if (window.twttr?.widgets) {
      void window.twttr.widgets.load(container)
    }
  }
  const existingScript = document.querySelector('script[data-x-widgets]')

  if (window.twttr?.widgets) {
    renderPosts()
    return
  }

  if (existingScript) {
    existingScript.addEventListener('load', renderPosts, { once: true })
    return
  }

  const script = document.createElement('script')
  script.src = 'https://platform.x.com/widgets.js'
  script.async = true
  script.dataset.xWidgets = 'true'
  script.addEventListener('load', renderPosts, { once: true })
  document.head.append(script)
}

function renderPreview() {
  previewTitle.textContent = titleInput.value.trim() || fallbackTitle()
  previewBody.replaceChildren()

  let photoIndex = 0
  let hasContent = false
  let hasXPost = false

  blocks.forEach((block) => {
    if (block.type === 'text') {
      if (block.value.trim()) {
        renderMarkdown(previewBody, block.value)
        hasContent = true
      }

      return
    }

    if (block.type === 'photo') {
      photoIndex += 1
      const figure = document.createElement('figure')
      figure.className = 'preview-photo'
      const image = document.createElement('img')
      image.src = block.url
      image.alt = `日記の写真 ${photoIndex}`
      figure.append(image)
      previewBody.append(figure)
      hasContent = true
      return
    }

    if (block.type === 'youtube') {
      previewBody.append(createYouTubePreview(block))
    } else {
      previewBody.append(createXPreview(block))
      hasXPost = true
    }
    hasContent = true
  })

  if (hasXPost) {
    loadXWidgets(previewBody)
  }

  if (!hasContent) {
    const empty = document.createElement('p')
    empty.className = 'preview-empty'
    empty.textContent = '本文を書くと、ここに表示されます。'
    previewBody.append(empty)
  }
}

function selectTab(tab) {
  const showingPreview = tab === 'preview'
  editTab.setAttribute('aria-selected', String(!showingPreview))
  previewTab.setAttribute('aria-selected', String(showingPreview))
  editPanel.hidden = showingPreview
  previewPanel.hidden = !showingPreview

  if (showingPreview) {
    syncBody()
    renderPreview()
  }
}

function clearPhotoUrls() {
  photoBlocks().forEach((block) => {
    if (block.file) {
      URL.revokeObjectURL(block.url)
    }
  })
}

function hydrateBlocks(values) {
  return values.map((block) => {
    if (block.type === 'text') {
      return createTextBlock(block.value, block.id)
    }

    if (block.type === 'photo') {
      return createStoredPhotoBlock(block.id, block.url)
    }

    const parsed = parseEmbedUrl(block.url)
    return {
      type: block.type,
      id: block.id,
      url: block.url,
      account: parsed?.account,
      videoId: parsed?.videoId,
    }
  })
}

async function loadDraft(date, confirmDiscard = false) {
  if (confirmDiscard && isDirty && !window.confirm('未保存の変更があります。破棄して別の日を開きますか？')) {
    entryDateInput.value = currentDraft.date
    return
  }

  isBusy = true
  setStatus('下書きを読み込んでいます。')
  updateDraftStateUI()

  try {
    const result = await requestJson(`/api/draft?date=${encodeURIComponent(date)}`)
    clearPhotoUrls()
    currentDraft = result.entry
    isDirty = false
    entryDateInput.max = result.today
    entryDateInput.value = result.entry.date
    titleInput.value = result.entry.title || ''
    blocks = result.entry.blocks.length ? hydrateBlocks(result.entry.blocks) : [createTextBlock()]
    activeTextSelection = null
    pendingPhotoInsertion = null
    pendingEmbedInsertion = null
    syncBody()
    selectTab('edit')
    setStatus('')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '下書きの読み込みに失敗しました。', 'error')
  } finally {
    isBusy = false
    renderEditor()
    updateDraftStateUI()
  }
}

function applyDraftMetadata(result) {
  currentDraft = result.entry
  entryDateInput.value = result.entry.date
  updateDraftStateUI()
}

photoInput.addEventListener('change', () => {
  const files = Array.from(photoInput.files || [])
  photoInput.value = ''

  if (files.length) {
    insertSelectedPhotos(files)
  }
})

embedForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const embed = parseEmbedUrl(embedUrlInput.value)

  if (!embed) {
    embedError.textContent = 'YouTube動画またはXの投稿URLを確認してください。'
    embedUrlInput.focus()
    return
  }

  if (!pendingEmbedInsertion || !insertEmbedAt(pendingEmbedInsertion, embed)) {
    embedError.textContent = '挿入位置を確認できませんでした。もう一度お試しください。'
    return
  }

  embedDialog.close()
})

embedCancel.addEventListener('click', () => {
  pendingEmbedInsertion = null
  embedDialog.close()
})

embedDialog.addEventListener('cancel', () => {
  pendingEmbedInsertion = null
})

editTab.addEventListener('click', () => selectTab('edit'))
previewTab.addEventListener('click', () => selectTab('preview'))
titleInput.addEventListener('input', () => {
  markDirty()

  if (!previewPanel.hidden) {
    renderPreview()
  }
})

entryDateInput.addEventListener('change', () => {
  if (entryDateInput.value) {
    void loadDraft(entryDateInput.value, true)
  }
})

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  setStatus('')
  syncBody()

  const body = bodyInput.value
  const photos = photoBlocks()

  if (!body) {
    setStatus('本文または写真を追加してください。', 'error')
    selectTab('edit')
    blockEditor.querySelector('textarea')?.focus()
    return
  }

  if (body.length > maxBodyLength) {
    setStatus(`本文は${maxBodyLength.toLocaleString('ja-JP')}文字以内にしてください。`, 'error')
    return
  }

  const data = new FormData()
  data.set('date', currentDraft.date)
  data.set('version', String(currentDraft.version))
  data.set('title', titleInput.value)
  data.set('blocks', JSON.stringify(serializeDraftBlocks()))
  photos.forEach((photo) => {
    if (photo.file) {
      data.append('photos', photo.file, photo.file.name)
      data.append('photoIds', photo.id)
    }
  })

  isBusy = true
  updateDraftStateUI()
  setStatus('下書きを保存しています。写真がある場合は少し時間がかかります。')

  try {
    const result = await requestJson('/api/draft/save', {
      method: 'POST',
      body: data,
    })
    clearPhotoUrls()
    currentDraft = result.entry
    titleInput.value = result.entry.title || ''
    blocks = hydrateBlocks(result.entry.blocks)
    isDirty = false
    syncBody()
    renderEditor()
    setStatus(result.message)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '下書きの保存に失敗しました。', 'error')
  } finally {
    isBusy = false
    updateDraftStateUI()
  }
})

readyButton.addEventListener('click', async () => {
  if (isDirty) {
    setStatus('先に下書きを保存してください。', 'error')
    return
  }

  const ready = !currentDraft.ready
  isBusy = true
  updateDraftStateUI()
  setStatus(ready ? '公開OKに切り替えています。' : '公開OKを外しています。')

  try {
    const result = await requestJson('/api/draft/ready', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        date: currentDraft.date,
        version: currentDraft.version,
        ready,
      }),
    })
    applyDraftMetadata(result)
    setStatus(result.message)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '公開OKの変更に失敗しました。', 'error')
  } finally {
    isBusy = false
    updateDraftStateUI()
  }
})

manualPublishButton.addEventListener('click', async () => {
  if (!window.confirm('保存済みの内容を今すぐ公開しますか？')) {
    return
  }

  isBusy = true
  updateDraftStateUI()
  setStatus('日記を公開しています。画面を閉じずにお待ちください。')

  try {
    const result = await requestJson('/api/draft/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ date: currentDraft.date }),
    })
    clearPhotoUrls()
    blocks = result.entry.blocks.length ? hydrateBlocks(result.entry.blocks) : [createTextBlock()]
    titleInput.value = result.entry.title || titleInput.value
    syncBody()
    applyDraftMetadata(result)
    renderEditor()
    setStatus(result.message)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '手動公開に失敗しました。', 'error')
    await loadDraft(currentDraft.date)
  } finally {
    isBusy = false
    updateDraftStateUI()
  }
})

window.addEventListener('beforeunload', (event) => {
  if (isDirty) {
    event.preventDefault()
    event.returnValue = ''
  }
})

window.addEventListener('pagehide', clearPhotoUrls)

const initialDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())

currentDraft.date = initialDate
entryDateInput.value = initialDate
renderEditor()
syncBody()
updateDraftStateUI()
void loadDraft(initialDate)
