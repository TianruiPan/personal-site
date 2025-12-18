import * as THREE from 'three'

export function setupRaycast({ camera, scene, renderer, pickables, onPick, onHover }) {
  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  let _lastHover = null

  // (removed hit marker visualization)

  renderer.domElement.addEventListener('click', (event) => {
    const rect = renderer.domElement.getBoundingClientRect()

    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    raycaster.setFromCamera(mouse, camera)

    const intersects = raycaster.intersectObjects(pickables, false)

    if (intersects.length > 0) {
      const hit = intersects[0]
      if (typeof onPick === 'function') onPick(hit.object.name, hit)
      else console.log('clicked:', hit.object.name)
    }
  })

  // hover handling: call onHover(name, hit) when pointer moves over pickables
  renderer.domElement.addEventListener('mousemove', (event) => {
    const rect = renderer.domElement.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    raycaster.setFromCamera(mouse, camera)
    const hi = raycaster.intersectObjects(pickables, false)
    if (hi.length > 0) {
      const hit = hi[0]
      const name = hit.object.name
      if (name !== _lastHover) {
        _lastHover = name
        if (typeof onHover === 'function') onHover(name, hit)
      }
    } else {
      if (_lastHover !== null) {
        _lastHover = null
        if (typeof onHover === 'function') onHover(null, null)
      }
    }
  })

  // pointerleave: clear hover when leaving canvas
  renderer.domElement.addEventListener('mouseleave', () => {
    _lastHover = null
    // scene-level handler will be invoked via mousemove when needed; here we simply reset
  })
}
