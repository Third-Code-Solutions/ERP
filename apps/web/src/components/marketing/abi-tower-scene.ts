import {
  ACESFilmicToneMapping,
  CanvasTexture,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  EdgesGeometry,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PMREMGenerator,
  Plane,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * Real-time scene for the Blender tower (scripts/blender/build-tower.py).
 * The model is driven by object name, so those names are an interface.
 *
 * One continuous value `s` (0 to 4) says how far the project has progressed:
 *   0.0 to 0.5  site, podium rises
 *   0.5 to 1.7  floor slabs rise, bottom to top
 *   1.3 to 2.1  structural core
 *   1.7 to 2.7  diagrid exoskeleton climbs
 *   2.5 to 3.5  glass fills in, floor by floor
 *   3.45 to 4.0 crown, lights on, crane retreats, neighbours appear
 */
const MODEL_URL = '/models/abi-tower.glb'
const FLOORS = 26
const FLOOR_H = 3.6
const BASE_Y = 11
const TOP_Y = BASE_Y + FLOORS * FLOOR_H
const DIAGRID_MODULES = 8
const INTRO_SECONDS = 8.5
const FULL = 4

/** Where each ERP process stage sits on the build timeline. */
export const STAGE_PROGRESS = [0.35, 1.7, 2.7, 3.55, 4] as const

export interface TowerLabelSpec {
  readonly id: string
  /** Build progress range in which the label shows. */
  readonly from: number
  readonly to: number
}

export interface TowerHover {
  readonly floor: number
  readonly x: number
  readonly y: number
  readonly areaM2: number
}

export interface TowerOptions {
  /** Aborts creation before the canvas is touched, e.g. when React remounts. */
  readonly signal: AbortSignal
  readonly canvas: HTMLCanvasElement
  readonly host: HTMLElement
  readonly mode: 'intro' | 'stage'
  readonly isReducedMotion: boolean
  readonly labels: Readonly<Record<string, HTMLElement | null>>
  readonly labelSpecs: readonly TowerLabelSpec[]
  readonly onHover?: (hover: TowerHover | null) => void
  readonly onProgress?: (progress: { floors: number; total: number }) => void
}

export interface TowerController {
  setStage(index: number): void
  setActive(isActive: boolean): void
  replay(): void
  dispose(): void
}

interface FloorParts {
  readonly slab: Mesh
  readonly glass: Mesh
  readonly glassMaterial: MeshPhysicalMaterial
  readonly ghost: LineSegments
  /** 0 to 1: how far into the build this floor's windows come on. */
  readonly lightAt: number
  readonly isLit: boolean
  hover: number
}

const clamp01 = (value: number): number => MathUtils.clamp(value, 0, 1)
const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2

let modelRequest: Promise<Group> | null = null

function loadModel(): Promise<Group> {
  modelRequest ??= new GLTFLoader().loadAsync(MODEL_URL).then((gltf) => gltf.scene)
  return modelRequest
}

/** True when this browser can create a WebGL context at all. */
export function canRenderWebGL(): boolean {
  try {
    const probe = document.createElement('canvas')
    const gl = probe.getContext('webgl2') ?? probe.getContext('webgl')
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

function radialFade(): CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, '#fff')
    gradient.addColorStop(0.5, '#fff')
    gradient.addColorStop(1, '#000')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }
  return new CanvasTexture(canvas)
}

/** Floor footprint, mirroring the Blender script's taper. */
function floorAreaM2(index: number): number {
  const t = index / (FLOORS - 1)
  const taper = t ** 1.15
  const width = 38 + (25 - 38) * taper
  const depth = 29 + (19 - 29) * taper
  return Math.round(width * depth * 0.95)
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export async function createTowerScene(options: TowerOptions): Promise<TowerController> {
  const { signal, canvas, host, mode, isReducedMotion, labels, labelSpecs, onHover, onProgress } = options

  const model = await loadModel()
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')

  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.localClippingEnabled = true
  renderer.setClearColor(0x000000, 0)

  const scene = new Scene()
  const pmrem = new PMREMGenerator(renderer)
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04)
  scene.environment = environment.texture
  scene.environmentIntensity = 0.55

  const camera = new PerspectiveCamera(30, 1, 1, 1200)

  const hemisphere = new HemisphereLight(0xeaf2ff, 0xf1e7da, 0.9)
  const sun = new DirectionalLight(0xfff3e2, 2.6)
  sun.position.set(130, 190, 95)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -120
  sun.shadow.camera.right = 120
  sun.shadow.camera.top = 140
  sun.shadow.camera.bottom = -120
  sun.shadow.camera.near = 20
  sun.shadow.camera.far = 520
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.6
  const rim = new DirectionalLight(0xbcd4ff, 0.9)
  rim.position.set(-160, 90, -140)
  scene.add(hemisphere, sun, rim)

  // ---- model -----------------------------------------------------------------
  const root = model.clone(true)
  scene.add(root)
  const named = (name: string): Object3D | undefined => root.getObjectByName(name)

  const materials: Material[] = []
  const track = <T extends Material>(material: T): T => {
    materials.push(material)
    return material
  }

  const concrete = track(new MeshStandardMaterial({ color: 0xeeeae2, roughness: 0.82 }))
  const core = track(new MeshStandardMaterial({ color: 0x1b2e47, roughness: 0.5, metalness: 0.25 }))
  const gold = track(
    new MeshStandardMaterial({ color: 0xe07b2a, roughness: 0.28, metalness: 0.85, emissive: 0xe07b2a, emissiveIntensity: 0.12 }),
  )
  const diagridClip = new Plane(new Vector3(0, -1, 0), 0)
  const steel = track(
    new MeshStandardMaterial({ color: 0x15406b, roughness: 0.38, metalness: 0.75, clippingPlanes: [diagridClip] }),
  )
  const plaza = track(new MeshStandardMaterial({ color: 0xdcd9d2, roughness: 0.95 }))
  const tree = track(new MeshStandardMaterial({ color: 0x4f7c55, roughness: 0.9 }))
  const context = track(new MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.85, transparent: true, opacity: 0 }))
  const truckMaterial = track(new MeshStandardMaterial({ color: 0xe07b2a, roughness: 0.55 }))
  const dark = track(new MeshStandardMaterial({ color: 0x20262e, roughness: 0.7 }))

  const MATERIAL_BY_NAME: Record<string, Material> = {
    concrete,
    core,
    gold,
    steel,
    plaza,
    tree,
    context,
    truck: truckMaterial,
    dark,
  }

  const textures: CanvasTexture[] = []
  const fade = radialFade()
  textures.push(fade)
  const ground = new Mesh(
    new CircleGeometry(150, 96),
    track(new MeshStandardMaterial({ color: 0xf6f7f8, roughness: 1, transparent: true, alphaMap: fade, depthWrite: false })),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.04
  ground.receiveShadow = true
  scene.add(ground)
  const original = named('site_ground')
  if (original) original.visible = false

  const glassBase = {
    color: 0x6fb2d8,
    roughness: 0.06,
    metalness: 0.0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: DoubleSide,
    envMapIntensity: 1.3,
    emissive: new Color(0xffc489),
    emissiveIntensity: 0,
  } as const

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    object.castShadow = true
    object.receiveShadow = true
    const source = Array.isArray(object.material) ? object.material[0] : object.material
    const key = source?.name ?? ''
    const replacement = MATERIAL_BY_NAME[key]
    if (replacement) object.material = replacement
  })

  const floors: FloorParts[] = []
  const ghostMaterials: LineBasicMaterial[] = []
  for (let i = 0; i < FLOORS; i += 1) {
    const slab = named(`slab_${String(i + 1).padStart(2, '0')}`) as Mesh | undefined
    const glass = named(`glass_${String(i + 1).padStart(2, '0')}`) as Mesh | undefined
    if (!slab || !glass) throw new Error(`Tower model is missing floor ${i + 1}`)
    slab.material = concrete
    const glassMaterial = track(new MeshPhysicalMaterial({ ...glassBase, emissive: new Color(0xffc489) }))
    glass.material = glassMaterial
    glass.castShadow = false
    glass.renderOrder = 2 + i
    const ghostMaterial = new LineBasicMaterial({ color: 0x15406b, transparent: true, opacity: 0.4 })
    ghostMaterials.push(ghostMaterial)
    const ghost = new LineSegments(new EdgesGeometry(slab.geometry, 20), ghostMaterial)
    ghost.position.copy(slab.position)
    ghost.rotation.copy(slab.rotation)
    root.add(ghost)
    floors.push({
      slab,
      glass,
      glassMaterial,
      ghost,
      lightAt: 0.2 + pseudoRandom(i + 3) * 0.75,
      isLit: pseudoRandom(i + 41) > 0.28,
      hover: 0,
    })
  }

  const podiumSlab = named('podium_slab') as Mesh
  const podiumGlass = named('podium_glass') as Mesh
  podiumGlass.material = track(new MeshPhysicalMaterial({ ...glassBase, emissive: new Color(0xffc489) }))
  const podiumGlassMaterial = podiumGlass.material as MeshPhysicalMaterial
  podiumGlass.castShadow = false
  const coreMesh = named('core') as Mesh
  const diagrid = Array.from({ length: DIAGRID_MODULES }, (_, i) =>
    named(`diagrid_${String(i + 1).padStart(2, '0')}`),
  ).filter((object): object is Object3D => object !== undefined)
  const crownBox = named('crown_box') as Mesh
  const crownFins = named('crown_fins') as Mesh
  const mast = named('mast') as Mesh
  const craneMast = named('crane_mast') as Mesh
  const craneJib = named('crane_jib') as Object3D
  const truckA = named('truck_a') as Object3D
  const truckB = named('truck_b') as Object3D
  const neighbors = named('neighbors') as Mesh
  const trees = named('trees') as Mesh
  const fence = named('site_fence') as Mesh
  const truckAHome = truckA.position.clone()
  const truckBHome = truckB.position.clone()
  const craneJibHome = craneJib.position.y
  const craneJibYaw = craneJib.rotation.y

  const setScaleY = (object: Object3D, value: number): void => {
    object.visible = value > 0.001
    object.scale.y = Math.max(value, 0.0001)
  }

  // ---- labels ------------------------------------------------------------------
  const anchors: Record<string, Vector3> = {
    floor: new Vector3(17, BASE_Y + 13 * FLOOR_H + 2, 0),
    crown: new Vector3(0, TOP_Y + 22, 0),
  }
  const craneTip = new Vector3()

  // ---- state ---------------------------------------------------------------------
  let progress = mode === 'intro' && !isReducedMotion ? 0 : FULL
  let target = progress
  let introTime = 0
  let isIntro = mode === 'intro' && !isReducedMotion
  let azimuth = 0.62
  let dragAzimuth = 0
  let dragVelocity = 0
  let isDragging = false
  let lastX = 0
  let pointer = new Vector2(0, 0)
  const pointerSmooth = new Vector2(0, 0)
  let hovered = -1
  let isActive = true
  let isDisposed = false
  let frame = 0
  let last = performance.now()
  let width = 1
  let height = 1
  let lastReported = -1
  let lastReportAt = 0

  const raycaster = new Raycaster()
  const ndc = new Vector2()

  function apply(s: number, time: number): void {
    // ground and site
    setScaleY(podiumSlab, easeOutCubic(clamp01((s - 0.2) / 0.55)))
    setScaleY(podiumGlass, easeOutCubic(clamp01((s - 2.2) / 0.5)))
    podiumGlassMaterial.opacity = 0.34 * clamp01((s - 2.2) / 0.5)

    // floor slabs and their ghost outlines
    let built = 0
    floors.forEach((floor, i) => {
      const f = i / (FLOORS - 1)
      const slabP = clamp01((s - (0.5 + f * 0.8)) / 0.4)
      setScaleY(floor.slab, easeOutCubic(slabP))
      const ghostMaterial = ghostMaterials[i]
      if (ghostMaterial) ghostMaterial.opacity = 0.42 * (1 - slabP)
      floor.ghost.visible = slabP < 0.999

      const glassP = clamp01((s - (2.5 + f * 0.7)) / 0.35)
      setScaleY(floor.glass, easeOutCubic(glassP))
      floor.glassMaterial.opacity = 0.36 * glassP
      const lightP = floor.isLit ? clamp01((s - (3.55 + floor.lightAt * 0.35)) / 0.12) : 0
      floor.glassMaterial.emissiveIntensity = lightP * 0.85 + floor.hover * 0.9
      if (floor.hover > 0.01 && floor.glassMaterial.emissive) {
        floor.glassMaterial.emissive.setHex(floor.hover > 0.5 ? 0xe07b2a : 0xffc489)
      } else {
        floor.glassMaterial.emissive.setHex(0xffc489)
      }
      if (slabP > 0.98) built += 1
    })

    // core and diagrid
    setScaleY(coreMesh, easeOutCubic(clamp01((s - 1.3) / 0.8)))
    const climb = clamp01((s - 1.7) / 1.0)
    diagridClip.constant = BASE_Y + climb * (TOP_Y - BASE_Y + 8)
    diagrid.forEach((module, i) => {
      module.visible = climb > i / DIAGRID_MODULES - 0.001
    })

    // crown
    const crownP = clamp01((s - 3.45) / 0.4)
    setScaleY(crownBox, easeOutCubic(crownP))
    setScaleY(crownFins, easeOutCubic(clamp01((s - 3.55) / 0.4)))
    setScaleY(mast, easeOutCubic(clamp01((s - 3.7) / 0.3)))
    gold.emissiveIntensity = 0.12 + clamp01((s - 3.6) / 0.4) * 0.5

    // crane: slews while building, then retreats
    const retreat = easeOutCubic(clamp01((s - 3.5) / 0.45))
    const craneScale = 1 - retreat
    craneMast.visible = craneScale > 0.01
    craneMast.scale.y = Math.max(craneScale, 0.0001)
    craneJib.visible = craneScale > 0.01
    craneJib.scale.setScalar(Math.max(craneScale, 0.0001))
    craneJib.position.y = craneJibHome * craneScale
    craneJib.rotation.y = craneJibYaw + Math.sin(time * 0.35) * 0.55 + s * 0.28

    // deliveries
    const deliveryA = easeInOut(clamp01((s - 1.6) / 0.9))
    const deliveryB = easeInOut(clamp01((s - 2.3) / 0.9))
    const leave = clamp01((s - 3.4) / 0.5)
    truckA.position.set(truckAHome.x, truckAHome.y, truckAHome.z + 15 * deliveryA - 30 * leave)
    truckB.position.set(truckBHome.x, truckBHome.y, truckBHome.z - 14 * deliveryB + 28 * leave)
    truckA.visible = leave < 0.98
    truckB.visible = leave < 0.98

    // handover: neighbours appear, light turns warm
    const handover = clamp01((s - 3.55) / 0.45)
    context.opacity = handover
    neighbors.visible = handover > 0.01
    trees.visible = true
    fence.visible = s < 3.9
    sun.color.setRGB(1, 0.953 - handover * 0.08, 0.886 - handover * 0.26)
    sun.intensity = 2.6 + handover * 0.5

    if (onProgress) {
      const now = performance.now()
      if (built !== lastReported && now - lastReportAt > 120) {
        lastReported = built
        lastReportAt = now
        onProgress({ floors: built, total: FLOORS })
      }
    }
  }

  function easeInOut(t: number): number {
    return easeInOutCubic(t)
  }

  function frameCamera(time: number, dt: number): void {
    const aspect = width / Math.max(height, 1)
    const base = 286 * Math.max(1, 0.95 / aspect) * (mode === 'stage' ? 1.06 : 1)
    const intro = isIntro ? clamp01(introTime / INTRO_SECONDS) : 1
    const distance = base * (1 + (1 - easeOutCubic(intro)) * 0.42) * (1 + clamp01((progress - 3.6) / 0.4) * 0.06)
    if (!isReducedMotion && !isDragging) azimuth += dt * 0.055
    dragAzimuth += dragVelocity
    dragVelocity *= isDragging ? 0 : 0.94
    pointerSmooth.lerp(pointer, 1 - Math.exp(-dt * 3))
    const az = azimuth + dragAzimuth + pointerSmooth.x * 0.16 + (1 - easeOutCubic(intro)) * -0.9
    const elevation = 0.27 + pointerSmooth.y * -0.05 + (mode === 'stage' ? 0.06 : 0) + (1 - easeOutCubic(intro)) * 0.1
    const lookY = MathUtils.lerp(44, 56, clamp01(progress / 2.6))
    camera.position.set(
      Math.sin(az) * Math.cos(elevation) * distance,
      lookY + Math.sin(elevation) * distance,
      Math.cos(az) * Math.cos(elevation) * distance,
    )
    camera.lookAt(0, lookY, 0)
    camera.updateMatrixWorld()
    void time
  }

  function projectLabels(): void {
    craneTip.set(60, 3, 0)
    craneJib.localToWorld(craneTip)
    const point: Record<string, Vector3> = { ...anchors, crane: craneTip }
    for (const spec of labelSpecs) {
      const element = labels[spec.id]
      const world = point[spec.id]
      if (!element || !world) continue
      const projected = world.clone().project(camera)
      const isOn = progress >= spec.from && progress <= spec.to && projected.z < 1
      element.dataset.on = isOn ? 'true' : 'false'
      const x = ((projected.x + 1) / 2) * width
      const y = ((1 - projected.y) / 2) * height
      element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    }
  }

  function render(now: number): void {
    // Build progress follows real elapsed time, so a slow GPU stretches frames
    // rather than the animation; camera easing keeps the tighter step.
    const elapsed = Math.min(0.25, (now - last) / 1000)
    const dt = Math.min(0.05, elapsed)
    last = now
    const time = now / 1000
    if (isIntro) {
      introTime += elapsed
      progress = FULL * easeInOutCubic(clamp01(introTime / INTRO_SECONDS))
      if (introTime >= INTRO_SECONDS) {
        isIntro = false
        progress = FULL
        target = FULL
      }
    } else if (Math.abs(target - progress) > 0.0005) {
      progress += (target - progress) * (1 - Math.exp(-elapsed * 2.4))
    } else {
      progress = target
    }
    floors.forEach((floor, i) => {
      const goal = i === hovered ? 1 : 0
      floor.hover += (goal - floor.hover) * (1 - Math.exp(-dt * 10))
    })
    apply(progress, time)
    frameCamera(time, dt)
    projectLabels()
    renderer.render(scene, camera)
  }

  function loop(now: number): void {
    if (isDisposed || !isActive) return
    render(now)
    frame = requestAnimationFrame(loop)
  }

  function start(): void {
    cancelAnimationFrame(frame)
    last = performance.now()
    if (isReducedMotion) {
      render(last)
    } else {
      frame = requestAnimationFrame(loop)
    }
  }

  // ---- input ----------------------------------------------------------------------
  function toHost(event: PointerEvent): { x: number; y: number; nx: number; ny: number } {
    const box = host.getBoundingClientRect()
    const x = event.clientX - box.left
    const y = event.clientY - box.top
    return { x, y, nx: (x / box.width) * 2 - 1, ny: (y / box.height) * 2 - 1 }
  }

  function pick(nx: number, ny: number): number {
    ndc.set(nx, -ny)
    raycaster.setFromCamera(ndc, camera)
    const candidates = floors.filter((floor) => floor.glass.visible && floor.glass.scale.y > 0.6).map((floor) => floor.glass)
    const hit = raycaster.intersectObjects(candidates, false)[0]
    if (!hit) return -1
    return floors.findIndex((floor) => floor.glass === hit.object)
  }

  function onPointerMove(event: PointerEvent): void {
    const position = toHost(event)
    pointer = new Vector2(position.nx, position.ny)
    if (isDragging) {
      const dx = event.clientX - lastX
      lastX = event.clientX
      dragAzimuth += dx * 0.0065
      dragVelocity = dx * 0.0012
      return
    }
    if (event.pointerType === 'touch') return
    const index = pick(position.nx, position.ny)
    if (index !== hovered) {
      hovered = index
      if (isReducedMotion) render(performance.now())
    }
    onHover?.(
      index >= 0 ? { floor: index + 1, x: position.x, y: position.y, areaM2: floorAreaM2(index) } : null,
    )
  }

  function onPointerDown(event: PointerEvent): void {
    isDragging = true
    lastX = event.clientX
    canvas.setPointerCapture(event.pointerId)
  }

  function onPointerUp(event: PointerEvent): void {
    isDragging = false
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
  }

  function onPointerLeave(): void {
    pointer = new Vector2(0, 0)
    hovered = -1
    onHover?.(null)
  }

  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('pointerleave', onPointerLeave)

  // ---- sizing -----------------------------------------------------------------------
  function resize(): void {
    width = Math.max(1, host.clientWidth)
    height = Math.max(1, host.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 700 ? 1.5 : 2))
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    if (isReducedMotion) render(performance.now())
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()
  start()

  return {
    setStage(index) {
      target = STAGE_PROGRESS[MathUtils.clamp(index, 0, STAGE_PROGRESS.length - 1)] ?? FULL
      if (isReducedMotion) {
        progress = target
        render(performance.now())
      }
    },
    setActive(next) {
      if (next === isActive) return
      isActive = next
      if (next) start()
      else cancelAnimationFrame(frame)
    },
    replay() {
      if (mode !== 'intro' || isReducedMotion) return
      introTime = 0
      isIntro = true
      progress = 0
    },
    dispose() {
      isDisposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      materials.forEach((material) => material.dispose())
      ghostMaterials.forEach((material) => material.dispose())
      floors.forEach((floor) => floor.ghost.geometry.dispose())
      ground.geometry.dispose()
      textures.forEach((texture) => texture.dispose())
      environment.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
