import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { setupRaycast } from './raycast'

export function initScene() {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xffffff)

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  )
  camera.position.set(0, 2, 3)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  // disable shadowmaps and physically based lighting for flat unlit rendering
  renderer.shadowMap.enabled = false
  document.body.appendChild(renderer.domElement)

  const light = new THREE.DirectionalLight(0xffffff, 5)
  light.position.set(5, 5, 0)
  scene.add(light)

  const loader = new GLTFLoader()
  const pickables = []
  // Per-object default camera offsets (name -> [x,y,z]). Edit names/values as needed.
  // If a name exists here it will override the computed fallback offset.
  const defaultCameraOffsets = {
    // Example: 'MyMeshName': [0, 1.2, 2.5]
    'paper': [0, 1, 0],
    'monitor': [1, 0, 0],
    'desk': [3, 1.2, 0],
    'keyboard': [1, 0.5, 0]
  }
  // Per-object pickability map. If a name exists and is false, that object won't be pickable.
  // If a name is not present, the object is pickable by default.
  const defaultPickable = {
    'paper': true,
    'monitor': true,
    'ground': false,
    // 'desk': false, // example to make desk non-pickable
  }
  let _currentFocus = null
  let _cameraAnim = null
  let _lastHoveredEdgeName = null

  function setFocusByName(name) {
    if (!name) return
    const obj = scene.getObjectByName(name)
    if (!obj) return

    if (_currentFocus && _currentFocus !== obj) {
      _currentFocus.userData.focus = false
    }
    obj.userData = obj.userData || {}
    obj.userData.focus = true
    _currentFocus = obj
  }

  // Smooth camera move: targetOffset is relative vector in object's local space or world offset
  function moveCameraToObject(name, offset = new THREE.Vector3(2.5, 1, 0), duration = 700) {
    const obj = scene.getObjectByName(name)
    if (!obj) return

    // compute world target (object world position)
    const worldPos = new THREE.Vector3()
    obj.getWorldPosition(worldPos)

    // allow per-object offset from userData.cameraOffset (array [x,y,z])
    let useOffset = offset.clone()
    if (obj.userData && obj.userData.cameraOffset) {
      const co = obj.userData.cameraOffset
      useOffset = new THREE.Vector3(co[0], co[1], co[2])
    }

    // transform offset from object's local space to world space (approx)
    const offsetWorld = useOffset.clone().applyQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()))

    const targetPos = worldPos.clone().add(offsetWorld)

    const startPos = camera.position.clone()

    const startLook = new THREE.Vector3()
    camera.getWorldDirection(startLook)
    startLook.add(camera.position)
    const targetLook = worldPos.clone()

    const startTime = performance.now()
    const endTime = startTime + duration

    // instant move if duration <= 0
    if (!duration || duration <= 0) {
      camera.position.copy(targetPos)
      camera.lookAt(targetLook)
      setFocusByName(name)
      return
    }

    if (_cameraAnim) cancelAnimationFrame(_cameraAnim)

    function easeInOutQuad(t) {
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    }

    function step(now) {
      const t = Math.min(1, (now - startTime) / duration)
      const e = easeInOutQuad(t)

      camera.position.lerpVectors(startPos, targetPos, e)

      // interpolate lookAt smoothly from startLook -> targetLook
      const lerpedLook = startLook.clone().lerp(targetLook, e)
      camera.lookAt(lerpedLook)

      if (t < 1) {
        _cameraAnim = requestAnimationFrame(step)
      } else {
        _cameraAnim = null
        camera.position.copy(targetPos)
        camera.lookAt(targetLook)
        setFocusByName(name)
      }
    }

    // start on next frame to capture a stable baseline and avoid immediate tiny delta
    _cameraAnim = requestAnimationFrame((ts) => {
      // rebase startTime so the animation begins from this frame
      const now = ts || performance.now()
      // adjust startTime so t starts at 0 on first step
      const delta = now - startTime
      // shift startTime forward by delta so (now-startTime) === 0
      const rebasedStart = startTime + delta
      // use rebased startTime by replacing startTime variable via closure hack
      // (we'll shadow with a new const and let step read the outer startTime variable)
      // Simpler: call requestAnimationFrame with timestamp passed to step which uses now
      // So call step with this timestamp
      step(now)
    })
  }

  loader.load('/desk_scene.glb', (gltf) => {
    scene.add(gltf.scene)

    // convert glTF materials to unlit flat materials while preserving maps and vertex colors
    function convertToFlatMaterial(mat) {
      if (!mat) return new THREE.MeshBasicMaterial({ color: 0xffffff, flatShading: true })
      if (Array.isArray(mat)) return mat.map(convertToFlatMaterial)
      if (mat.isMeshBasicMaterial) {
        mat.flatShading = true
        mat.side = THREE.FrontSide
        mat.needsUpdate = true
        return mat
      }

      const params = { flatShading: true, side: THREE.FrontSide }
      if (mat.color) params.color = mat.color.clone()
      else params.color = new THREE.Color(0xffffff)
      if (mat.map) params.map = mat.map
      if (mat.vertexColors) params.vertexColors = mat.vertexColors
      if (mat.opacity !== undefined) {
        params.opacity = mat.opacity
        params.transparent = !!mat.transparent
      }

      const m = new THREE.MeshBasicMaterial(params)
      return m
    }

    gltf.scene.traverse((child) => {
      if (!child.isMesh) return

      // determine logical name: prefer the top-level named ancestor under gltf.scene
      let rootAncestor = child
      while (rootAncestor.parent && rootAncestor.parent !== gltf.scene) {
        rootAncestor = rootAncestor.parent
      }
      const logicalName = (rootAncestor && rootAncestor.name) ? rootAncestor.name : (child.name || '')

      // 显示实体网格（关闭线框），用于遮挡背后的边线
      child.visible = true
      // convert existing glTF material(s) to unlit flat material while preserving maps/vertex colors
      child.material = convertToFlatMaterial(child.material)
      child.castShadow = false
      child.receiveShadow = false
      child.renderOrder = 1

      // 使用 EdgesGeometry 生成边线，阈值很小以去除平面内的三角化线条
      const edgesGeometry = new THREE.EdgesGeometry(child.geometry, 0.01)
      const edgeLines = new THREE.LineSegments(
        edgesGeometry,
        new THREE.LineBasicMaterial({ color: 0x000000, depthTest: true })
      )
      edgeLines.name = logicalName + '_edges'
      edgeLines.position.copy(child.position)
      edgeLines.rotation.copy(child.rotation)
      edgeLines.scale.copy(child.scale)
      // ensure edges render after the mesh so depthTest hides back lines
      edgeLines.renderOrder = 2
      child.parent.add(edgeLines)

      // 给每个物体一个默认的 cameraOffset（优先使用 defaultCameraOffsets 中的映射）
      child.userData = child.userData || {}
      if (defaultCameraOffsets[logicalName]) {
        // prefer assigning offsets at the root ancestor level so all sub-meshes share it
        rootAncestor.userData = rootAncestor.userData || {}
        rootAncestor.userData.cameraOffset = defaultCameraOffsets[logicalName]
        child.userData.cameraOffset = rootAncestor.userData.cameraOffset
      } else if (child.userData && child.userData.cameraOffset) {
        // keep existing
      } else {
        // 计算回退偏移：基于边界框尺寸，保证相机稍高并向后一定距离
        const box = new THREE.Box3().setFromObject(child)
        const size = new THREE.Vector3()
        box.getSize(size)
        const depth = Math.max(size.z, size.length() * 0.6, 0.5)
        const computedOffset = new THREE.Vector3(0, Math.max(size.y, 0.5) * 0.8, depth * 1.8)
        // store computed offset on the root ancestor so siblings reuse the same fallback
        rootAncestor.userData = rootAncestor.userData || {}
        rootAncestor.userData.cameraOffset = [computedOffset.x, computedOffset.y, computedOffset.z]
        child.userData.cameraOffset = rootAncestor.userData.cameraOffset
      }

      /** 交互层：透明可点击 Mesh */
      const pickMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false
      })

      const isPickable = defaultPickable.hasOwnProperty(logicalName) ? !!defaultPickable[logicalName] : true
      if (isPickable) {
        const pickMesh = new THREE.Mesh(child.geometry, pickMaterial)
        pickMesh.name = logicalName
        pickMesh.position.copy(child.position)
        pickMesh.rotation.copy(child.rotation)
        pickMesh.scale.copy(child.scale)

        // 传递 cameraOffset 给可点击对象（pickMesh）以便点击时使用
        pickMesh.userData = pickMesh.userData || {}
        // prefer rootAncestor's cameraOffset when available
        pickMesh.userData.cameraOffset = (rootAncestor && rootAncestor.userData && rootAncestor.userData.cameraOffset) || child.userData.cameraOffset

        child.parent.add(pickMesh)
        pickables.push(pickMesh)
      }
    })

    setupRaycast({
      camera,
      scene,
      renderer,
      pickables,
      onPick: (name) => {
        // when a pick occurs, move camera to object's relative position and focus it
        moveCameraToObject(name)
      },
      onHover: (name) => {
        // highlight edge lines on hover
        if (name) {
          const edge = scene.getObjectByName(name + '_edges')
          if (edge && edge.material) {
            if (_lastHoveredEdgeName && _lastHoveredEdgeName !== name) {
              const prev = scene.getObjectByName(_lastHoveredEdgeName + '_edges')
              if (prev && prev.material) prev.material.color.set(0x000000)
            }
            edge.material.color.set(0x00ff00)
            renderer.domElement.style.cursor = 'pointer'
            _lastHoveredEdgeName = name
          }
        } else {
          if (_lastHoveredEdgeName) {
            const prev = scene.getObjectByName(_lastHoveredEdgeName + '_edges')
            if (prev && prev.material) prev.material.color.set(0x000000)
            _lastHoveredEdgeName = null
          }
          renderer.domElement.style.cursor = 'default'
        }
      }
    })

    // 初始默认 focus 到 desk（瞬移，保留当前 offset/pickable 数据）
    moveCameraToObject('desk', undefined, 0)
  })

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  function animate() {
    requestAnimationFrame(animate)
    renderer.render(scene, camera)
  }

  animate()
}
