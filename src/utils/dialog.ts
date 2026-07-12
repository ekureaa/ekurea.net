const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function trapDialogFocus(event: KeyboardEvent, dialog: HTMLElement | null) {
  if (event.key !== 'Tab' || !dialog) {
    return
  }

  const focusableElements = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
    .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true')

  if (!focusableElements.length) {
    event.preventDefault()
    dialog.focus()
    return
  }

  const firstElement = focusableElements[0]
  const lastElement = focusableElements[focusableElements.length - 1]
  const activeElement = document.activeElement

  if (event.shiftKey && (activeElement === firstElement || !dialog.contains(activeElement))) {
    event.preventDefault()
    lastElement.focus()
  } else if (!event.shiftKey && (activeElement === lastElement || !dialog.contains(activeElement))) {
    event.preventDefault()
    firstElement.focus()
  }
}
