document.addEventListener('DOMContentLoaded', () => {
  const summary = document.getElementById('summary')
  const internalList = document.getElementById('internal-list')
  const externalList = document.getElementById('external-list')
  const brokenList = document.getElementById('broken-list')
  const status = document.getElementById('status')

  function setStatus(text, checking) {
    if (!status) return
    let st = status.querySelector('.status-text')
    if (!st) {
      st = document.createElement('span')
      st.className = 'status-text'
      status.appendChild(st)
    }
    st.textContent = text
    if (checking) status.classList.add('checking')
    else status.classList.remove('checking')
  }

  function showToast(msg, duration = 1500) {
    const t = document.getElementById('toast')
    if (!t) return
    t.textContent = msg
    t.classList.add('show')
    clearTimeout(t._timeout)
    t._timeout = setTimeout(() => { t.classList.remove('show') }, duration)
  }

  const downloadExt = ['.pdf', '.zip', '.rar', '.7z', '.tar', '.gz', '.exe', '.dmg', '.msi', '.apk', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.mp3', '.mp4', '.m4a', '.wav']

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0]
    if (!tab) return

    // indicate we're starting checks (spinner shown via .checking)
    setStatus('Vérification des liens en cours...', true)

    // hide all groups while checking so the popup reste propre
    try {
      const secs = document.querySelectorAll('.section')
      secs.forEach(s => { s.style.display = 'none' })
    } catch (e) {}

    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        func: async () => {
          const anchors = Array.from(document.querySelectorAll('a[href]'))
          const seen = new Map()
          const pageHost = location.hostname
          const downloadExtLocal = ['.pdf', '.zip', '.rar', '.7z', '.tar', '.gz', '.exe', '.dmg', '.msi', '.apk', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.mp3', '.mp4', '.m4a', '.wav']

          let idx = 0
          for (const a of anchors) {
            try {
              let hrefAttr = a.getAttribute('href')
              if (!hrefAttr) continue
              const href = a.href || hrefAttr
              if (seen.has(href)) continue

              const isMailto = hrefAttr.trim().toLowerCase().startsWith('mailto:')
              let text = ''
              let hostname = ''
              let isDownload = false

              if (isMailto) {
                text = a.textContent || a.getAttribute('title') || hrefAttr.replace(/^mailto:/i, '')
                hostname = 'mailto'
              } else {
                try {
                  const url = new URL(href, location.href)
                  text = (a.textContent || a.getAttribute('title') || url.pathname).trim()
                  hostname = url.hostname
                  isDownload = downloadExtLocal.some(ext => url.pathname.toLowerCase().split('?')[0].endsWith(ext))
                } catch (e) {
                  text = a.textContent || a.getAttribute('title') || href
                  hostname = ''
                }
              }

              const dataId = 'sal-' + (idx++)
              try { a.setAttribute('data-sal-id', dataId) } catch (e) {}
              seen.set(href, { id: dataId, href, text: (text||href).trim(), hostname, isDownload, isEmail: isMailto, broken: false })
            } catch (e) {
              // ignore malformed
            }
          }

          // Also search for plaintext emails in the visible text and add as mailto: entries
          try {
            const bodyText = document.body ? document.body.innerText || '' : ''
            const emailRegex = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
            const found = new Set()
            let m
            while ((m = emailRegex.exec(bodyText)) !== null) {
              const email = m[0]
              const mailto = 'mailto:' + email
              if (seen.has(mailto) || found.has(mailto)) continue
              found.add(mailto)
              const dataId = 'sal-' + (idx++)
              // no DOM element to attach, but keep id null
              seen.set(mailto, { id: null, href: mailto, text: email, hostname: 'mailto', isDownload: false, isEmail: true, broken: false })
            }
          } catch (e) {
            // ignore
          }

          const items = Array.from(seen.values())

          // Best-effort HEAD checks for non-mailto links
          const checks = items.map(async (it) => {
            if (it.isEmail) return it
            try {
              const controller = new AbortController()
              const timeout = setTimeout(() => controller.abort(), 5000)
              const res = await fetch(it.href, { method: 'HEAD', signal: controller.signal })
              clearTimeout(timeout)
              if (res && res.status >= 400) it.broken = true
              try {
                const cd = res && res.headers && res.headers.get && res.headers.get('content-disposition')
                if (cd && cd.toLowerCase().includes('attachment')) it.isDownload = true
              } catch (e) {}
            } catch (e) {
              // ignore fetch errors (CORS, network)
            }
            return it
          })

          await Promise.all(checks)

          const internal = []
          const external = []
          const broken = []
          const email = []
          const downloads = []
          const images = []
          for (const it of items) {
            if (it.broken) {
              broken.push(it)
            } else if (it.isDownload) {
              downloads.push(it)
            } else if (it.isEmail) {
              email.push(it)
            } else if (it.hostname === pageHost) internal.push(it)
            else external.push(it)
          }

          // collect <img> elements as images (distinct from links)
          try {
            const imgEls = Array.from(document.querySelectorAll('img[src]'))
            const seenSrc = new Set()
            for (const im of imgEls) {
              try {
                const src = im.src
                if (!src) continue
                if (seenSrc.has(src)) continue
                seenSrc.add(src)
                const url = new URL(src, location.href)
                const imgId = 'sali-' + (idx++)
                try { im.setAttribute('data-sal-img-id', imgId) } catch (e) {}
                images.push({ id: imgId, src: url.href, alt: im.alt || '', width: im.naturalWidth || 0, height: im.naturalHeight || 0 })
              } catch (e) {}
            }
          } catch (e) {}

          return { internal, external, broken, email, downloads, images }
        }
      },
      (results) => {
        if (!results || !results[0] || !results[0].result) {
          summary.textContent = 'Aucun résultat.'
          setStatus('Vérification terminée.', false)
          return
        }
        const { internal, external, broken, email, downloads, images } = results[0].result
        summary.textContent = `Internes: ${internal.length} — Externes: ${external.length} — Téléchargements: ${downloads.length} — Emails: ${email.length} — Images: ${images.length} — Cassés: ${broken.length}`

          function addList(listEl, items) {
          if (!listEl) return
          const section = listEl.closest('.section')
          listEl.innerHTML = ''
          if (!items || items.length === 0) {
            if (section) section.style.display = 'none'
            return
          }
          if (section) section.style.display = ''
          for (const it of items) {
            const li = document.createElement('li')
            if (it.isDownload) li.classList.add('download')
            if (it.broken) li.classList.add('broken')

            const a = document.createElement('a')
            a.href = it.href
            a.textContent = it.text || it.href
            a.className = 'link'
            // open behavior replaced by scroll-to in page
            a.target = '_self'
            a.rel = 'noopener'

            // when clicked, ask the page to scroll to the original anchor element
            a.addEventListener('click', (ev) => {
              ev.preventDefault()
              try {
                chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: (id) => {
                    const el = document.querySelector('[data-sal-id="' + id + '"]')
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      const prev = el.style.outline
                      el.style.outline = '3px solid #f39c12'
                      setTimeout(() => { el.style.outline = prev }, 1500)
                    } else {
                      // fallback: try to find by href
                      const anchors = Array.from(document.querySelectorAll('a[href]'))
                      const found = anchors.find(a => a.href === id || a.getAttribute('href') === id)
                      if (found) { found.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
                    }
                  },
                  args: [it.id]
                })
              } catch (e) {
                // ignore
              }
            })

            // open-in-new-tab button
            const btn = document.createElement('button')
            btn.type = 'button'
            btn.className = 'open-btn'
            btn.title = 'Ouvrir dans un nouvel onglet'
            btn.textContent = '↗'
            btn.addEventListener('click', (ev) => {
              ev.stopPropagation()
              ev.preventDefault()
              try {
                chrome.tabs.create({ url: it.href })
              } catch (e) {
                // fallback if API unavailable
                window.open(it.href, '_blank')
              }
            })
            li.appendChild(btn)

            const span = document.createElement('span')
            span.className = 'url'
            span.textContent = it.href

            li.appendChild(a)
            li.appendChild(span)
            listEl.appendChild(li)
          }
        }

        function addImages(containerEl, items) {
          if (!containerEl) return
          const section = containerEl.closest('.section')
          containerEl.innerHTML = ''
          if (!items || items.length === 0) {
            if (section) section.style.display = 'none'
            return
          }
          if (section) section.style.display = ''
          for (const it of items) {
            const wrap = document.createElement('div')
            wrap.className = 'image-item'
            const img = document.createElement('img')
            img.src = it.src
            img.alt = it.alt || it.src
            img.loading = 'lazy'
            img.addEventListener('click', () => {
              try {
                if (chrome && chrome.tabs && chrome.tabs.create) {
                  chrome.tabs.create({ url: it.src, active: false }, () => {
                    showToast('Image ouverte en arrière-plan')
                    // try to show a small popover in the page near the image
                    try {
                      if (tab && tab.id) {
                        chrome.scripting.executeScript({
                          target: { tabId: tab.id },
                          func: (imgId) => {
                            try {
                              if (!imgId) return
                              const el = document.querySelector('[data-sal-img-id="' + imgId + '"]')
                              if (!el) return
                              const existing = document.getElementById('sal-inpage-pop')
                              if (existing) existing.remove()

                              const pop = document.createElement('div')
                              pop.id = 'sal-inpage-pop'
                              pop.className = 'sal-pop'
                              pop.innerHTML = '<span class="sal-pop-text">Image ouverte en arrière-plan</span><span class="sal-pop-arrow" aria-hidden="true"></span>'
                              pop.style.position = 'absolute'
                              pop.style.zIndex = 2147483647
                              pop.style.pointerEvents = 'none'
                              pop.style.maxWidth = '260px'
                              pop.style.padding = '10px 14px'
                              pop.style.borderRadius = '10px'
                              pop.style.background = 'rgba(20,20,20,0.94)'
                              pop.style.color = '#fff'
                              pop.style.fontSize = '13px'
                              pop.style.boxShadow = '0 10px 30px rgba(0,0,0,0.36)'
                              pop.style.transformOrigin = 'center bottom'

                              // hide while measuring
                              pop.style.visibility = 'hidden'
                              pop.style.opacity = '0'
                              pop.style.transform = 'translateY(6px) scale(0.98)'
                              pop.style.transition = 'opacity .18s ease, transform .18s ease'

                              document.body.appendChild(pop)

                              // measure and place
                              const rect = el.getBoundingClientRect()
                              const pageWidth = document.documentElement.clientWidth
                              const popRect = pop.getBoundingClientRect()
                              let top = rect.top + window.scrollY - popRect.height - 10
                              let placeBelow = false
                              if (top < 8) { top = rect.bottom + window.scrollY + 10; placeBelow = true }
                              let left = rect.left + window.scrollX + (rect.width / 2) - (popRect.width / 2)
                              left = Math.max(8, Math.min(left, pageWidth - popRect.width - 8))

                              pop.style.top = Math.round(top) + 'px'
                              pop.style.left = Math.round(left) + 'px'
                              pop.style.visibility = ''

                              // arrow placement
                              const arrow = pop.querySelector('.sal-pop-arrow')
                              if (arrow) {
                                arrow.style.position = 'absolute'
                                arrow.style.width = '12px'
                                arrow.style.height = '12px'
                                arrow.style.background = 'inherit'
                                arrow.style.transform = 'rotate(45deg)'
                                arrow.style.boxShadow = 'inherit'
                                const popRect2 = pop.getBoundingClientRect()
                                const arrowLeft = Math.max(10, Math.min(popRect2.width / 2 - 6, popRect2.width - 18))
                                if (placeBelow) {
                                  arrow.style.top = '-6px'
                                  arrow.style.left = arrowLeft + 'px'
                                } else {
                                  arrow.style.top = (popRect2.height - 6) + 'px'
                                  arrow.style.left = arrowLeft + 'px'
                                }
                              }

                              // animate in
                              requestAnimationFrame(() => {
                                pop.style.opacity = '1'
                                pop.style.transform = 'translateY(0) scale(1)'
                              })

                              setTimeout(() => {
                                pop.style.opacity = '0'
                                pop.style.transform = 'translateY(6px) scale(0.98)'
                                setTimeout(() => { try { pop.remove() } catch (e) {} }, 240)
                              }, 1300)
                            } catch (e) {}
                          },
                          args: [it.id]
                        })
                      }
                    } catch (e) {}
                  })
                } else {
                  window.open(it.src, '_blank')
                  showToast('Image ouverte en arrière-plan')
                }
              } catch (e) {
                window.open(it.src, '_blank')
                showToast('Image ouverte en arrière-plan')
              }
            })
            wrap.appendChild(img)
            containerEl.appendChild(wrap)
          }
        }

        addList(brokenList, broken)
        addList(document.getElementById('download-list'), downloads)
        addList(document.getElementById('email-list'), email)
        addList(internalList, internal)
        addList(externalList, external)
        addImages(document.getElementById('image-list'), images)

        setStatus('Vérification terminée.', false)
      }
    )
  })
})
