import './style.css'
import { initScene } from './scene'

// Create DOM structure: wrapper -> scene-window (canvas mounts here) + overlay info layer
export function initUI() {
  const wrapper = document.createElement('div')
  wrapper.className = 'scene-wrapper'

  const sceneWindow = document.createElement('div')
  sceneWindow.className = 'scene-window'
  // allow absolutely-positioned controls inside the scene window
  sceneWindow.style.position = 'relative'

  // inner container that exactly matches the scene-window content area (inside padding)
  const sceneInner = document.createElement('div')
  sceneInner.className = 'scene-inner'

  // UI overlay placed inside sceneWindow so it layers above the canvas
  const overlay = document.createElement('div')
  overlay.id = 'ui-overlay'
  const title = document.createElement('h1')
  title.textContent = 'My 3D Site'
  overlay.appendChild(title)



  // append inner first (canvas mounts here), then overlay so overlay sits above canvas
  sceneWindow.appendChild(sceneInner)
  sceneWindow.appendChild(overlay)
  wrapper.appendChild(sceneWindow)
  document.body.appendChild(wrapper)

  // Init the scene inside the inner container (so renderer uses the true content size)
  const api = initScene(sceneInner)

  // add a Home button to return to default camera view
  const homeBtn = document.createElement('button')
  homeBtn.className = 'home-button'
  homeBtn.title = 'Home'
  homeBtn.textContent = '🏠'
  homeBtn.style.position = 'absolute'
  homeBtn.style.top = '8px'
  homeBtn.style.right = '8px'
  homeBtn.style.zIndex = '50'
  homeBtn.style.padding = '6px 10px'
  homeBtn.style.border = 'none'
  homeBtn.style.borderRadius = '6px'
  homeBtn.style.background = 'rgba(255,255,255,0.9)'
  homeBtn.style.cursor = 'pointer'
  homeBtn.addEventListener('click', () => {
    if (api && api.goHome) api.goHome(700)
  })
  sceneWindow.appendChild(homeBtn)
}

// Auto-run on import for convenience (you can instead call initUI() manually)
initUI()
