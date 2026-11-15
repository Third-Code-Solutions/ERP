import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  Vector4,
  WebGLRenderer,
  BoxGeometry,
  DoubleSide,
  SRGBColorSpace,
  type IUniform,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

import {
  buildStory,
  clamp01,
  cumulativeLengths,
  edgePolyline,
  nodeAccess,
  samplePolyline,
  smoothstep,
  type BrainGraph,
  type BrainStory,
  type Vec3,
} from './abi-brain-graph'

/**
 * The Cortex brain (scripts/blender/build-brain.py) with the memory network
 * drawn inside it. A single chapter value `c` runs the story, so scrolling can
 * scrub it forwards and backwards:
 *
 *   c  -0.5 .. 0.5   records arrive as sparks and become nodes
 *      0.5 .. 1.5    relationships draw between them
 *      1.5 .. 2.5    a question wakes only the memories this seat may open
 *      2.5 .. 3.5    the answer's citation path lights up
 *      3.5 .. 4.5    a drafted action waits at the approval gate
 *      4.5 .. 5.5    each step is appended to the hash chain
 */
const MODEL_URL = '/models/abi-brain.glb'
const GRAPH_URL = '/models/abi-brain-graph.json'
const EDGE_SEGMENTS = 10
const MAX_PULSES = 160
const CHAIN_BLOCKS = 22
const HOT_SPOTS = 6

export interface BrainLabelSpec {
  readonly id: string
  readonly from: number
  readonly to: number
}

export interface BrainOptions {
  readonly signal: AbortSignal
  readonly canvas: HTMLCanvasElement
  readonly host: HTMLElement
  readonly isReducedMotion: boolean
  readonly labels: Readonly<Record<string, HTMLElement | null>>
  readonly labelSpecs: readonly BrainLabelSpec[]
}

export interface BrainController {
  setChapter(chapter: number): void
  setActive(isActive: boolean): void
  dispose(): void
}

interface Assets {
  readonly model: Group
  readonly graph: BrainGraph
}

let assetRequest: Promise<Assets> | null = null

function loadAssets(): Promise<Assets> {
  assetRequest ??= Promise.all([
    new GLTFLoader().loadAsync(MODEL_URL),
    fetch(GRAPH_URL).then((response) => {
      if (!response.ok) throw new Error(`Brain graph request failed: ${response.status}`)
      return response.json() as Promise<BrainGraph>
    }),
  ]).then(([gltf, graph]) => ({ model: gltf.scene, graph }))
  return assetRequest
}

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

// ---- palette (sRGB values; the shaders write straight to the screen) -----------
const REGION_COLORS = [0xe07b2a, 0x5cc8ff, 0xa99bff, 0x5ee6a8, 0xffd9a0].map((hex) => new Color(hex))
const GOLD = new Color(0xffb347)
const GREEN = new Color(0x5ee6a8)
const NAVY_EDGE = new Color(0x2b5481)

// ---- shaders -----------------------------------------------------------------------
const SHELL_VERTEX = /* glsl */ `
  attribute vec4 color;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vW;
  varying float vG;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = -mv.xyz;
    vW = (modelMatrix * vec4(position, 1.0)).xyz;
    vG = color.r;
    gl_Position = projectionMatrix * mv;
  }
`

const SHELL_FRAGMENT = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uDeep;
  uniform vec3 uRim;
  uniform float uOpacity;
  uniform float uGlow;
  uniform vec4 uHot[${HOT_SPOTS}];
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vW;
  varying float vG;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float fr = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.3);
    float l = clamp(dot(n, normalize(vec3(0.35, 0.8, 0.5))) * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uBase, uDeep, vG) * (0.4 + 0.9 * l);
    col += uRim * fr * (0.9 + uGlow * 0.6);
    float hot = 0.0;
    for (int i = 0; i < ${HOT_SPOTS}; i++) {
      float d = distance(vW, uHot[i].xyz);
      hot += uHot[i].w * exp(-d * d / 9.0);
    }
    col += vec3(1.0, 0.62, 0.25) * hot * 0.3;
    float a = (0.26 + fr * 0.66 + vG * 0.1 + hot * 0.2) * uOpacity;
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.94));
  }
`

const INNER_VERTEX = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`

const INNER_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uBoost;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float fr = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), 1.6);
    gl_FragColor = vec4(uColor * (0.5 + fr), (0.22 + fr * 0.5) * (0.6 + uBoost));
  }
`

const NODE_VERTEX = /* glsl */ `
  attribute vec3 aCol;
  attribute float aOrder;
  attribute float aState;
  attribute float aAct;
  uniform float uC;
  uniform float uScale;
  uniform float uScope;
  varying vec3 vCol;
  varying float vAct;
  varying float vAlpha;
  void main() {
    float arrived = step(aOrder, uC);
    float since = max(uC - aOrder, 0.0);
    float flash = arrived * exp(-since * 9.0);
    float vis = mix(1.0, aState, uScope);
    float act = clamp(aAct + flash * 0.9, 0.0, 1.5);
    float size = (0.3 + 0.62 * act) * (0.55 + 0.45 * vis) * smoothstep(0.0, 0.05, since) * arrived;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(size * uScale / -mv.z, 0.0);
    vCol = mix(aCol, vec3(0.42, 0.48, 0.58), (1.0 - vis) * 0.85);
    vAct = act * vis;
    vAlpha = (0.3 + 0.7 * vis) * arrived;
  }
`

const GLOW_FRAGMENT = /* glsl */ `
  varying vec3 vCol;
  varying float vAct;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.5, 0.1, d);
    float halo = exp(-d * d * 10.0) * 0.55;
    vec3 c = mix(vCol, vec3(1.0), clamp(vAct, 0.0, 1.0) * 0.55);
    gl_FragColor = vec4(c, (core * 0.9 + halo) * vAlpha);
  }
`

const SPARK_VERTEX = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aCtrl;
  attribute float aTime;
  uniform float uC;
  uniform float uScale;
  varying vec3 vCol;
  varying float vAct;
  varying float vAlpha;
  void main() {
    float s = clamp((uC - (aTime - 0.24)) / 0.24, 0.0, 1.0);
    float e = s * s * (3.0 - 2.0 * s);
    vec3 p = mix(mix(aStart, aCtrl, e), mix(aCtrl, position, e), e);
    float live = step(0.001, s) * (1.0 - step(0.999, s));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(0.26 * uScale / -mv.z * live, 0.0);
    vCol = vec3(1.0, 0.72, 0.3);
    vAct = 1.0;
    vAlpha = live;
  }
`

const EDGE_VERTEX = /* glsl */ `
  attribute float aT;
  attribute float aRank;
  attribute float aOrigin;
  attribute float aAct;
  attribute float aScope;
  uniform float uDraw;
  uniform float uTime;
  uniform float uScope;
  varying vec3 vC;
  varying float vA;
  void main() {
    float reveal = clamp((uDraw - aRank * 0.75) / 0.25, 0.0, 1.0);
    float visible = step(aT, reveal);
    vec3 c = aOrigin < 0.5 ? vec3(0.56, 0.72, 1.0) : (aOrigin < 1.5 ? vec3(0.36, 0.78, 1.0) : vec3(0.77, 0.66, 1.0));
    c = mix(c, vec3(1.0, 0.72, 0.3), clamp(aAct, 0.0, 1.0));
    float dash = aOrigin > 1.5 ? step(0.45, fract(aT * 5.0 - uTime * 0.5)) : 1.0;
    vC = c;
    vA = visible * dash * (0.13 + 0.85 * aAct) * mix(1.0, aScope, uScope);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const LINE_FRAGMENT = /* glsl */ `
  varying vec3 vC;
  varying float vA;
  void main() { gl_FragColor = vec4(vC, vA); }
`

const TRACT_VERTEX = /* glsl */ `
  attribute float aT;
  attribute float aSeed;
  uniform float uTime;
  uniform float uGlow;
  varying vec3 vC;
  varying float vA;
  void main() {
    float band = pow(sin((aT * 2.0 - uTime * 0.18 + aSeed) * 6.2832) * 0.5 + 0.5, 6.0);
    vC = mix(vec3(0.28, 0.5, 0.85), vec3(0.8, 0.9, 1.0), band);
    vA = (0.07 + 0.5 * band) * uGlow;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const TUBE_VERTEX = /* glsl */ `
  varying float vU;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vU = uv.x;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`

const TUBE_FRAGMENT = /* glsl */ `
  uniform float uReveal;
  uniform float uTime;
  varying float vU;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    if (vU > uReveal) discard;
    float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.4);
    float run = 0.65 + 0.35 * sin((vU * 40.0 - uTime * 3.0) * 1.0);
    vec3 c = mix(vec3(1.0, 0.7, 0.28), vec3(1.0, 0.95, 0.8), fr);
    gl_FragColor = vec4(c * run, 0.55 + fr * 0.45);
  }
`

const PULSE_VERTEX = /* glsl */ `
  attribute float aI;
  attribute vec3 aC;
  uniform float uScale;
  varying vec3 vCol;
  varying float vAct;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max((0.18 + 0.34 * aI) * uScale / -mv.z, 0.0);
    vCol = aC;
    vAct = aI;
    vAlpha = aI;
  }
`

type Uniforms = Record<string, IUniform>

const shader = (
  uniforms: Uniforms,
  vertexShader: string,
  fragmentShader: string,
  options: { blending?: typeof AdditiveBlending; transparent?: boolean; side?: typeof DoubleSide } = {},
): ShaderMaterial =>
  new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: options.transparent ?? true,
    depthWrite: false,
    toneMapped: false,
    ...(options.blending === undefined ? {} : { blending: options.blending }),
    ...(options.side === undefined ? {} : { side: options.side }),
  })

// ---- camera keyframes (az 0 looks at the occipital pole; the frontal lobe is -Z) ----------------
interface CameraKey {
  readonly az: number
  readonly el: number
  readonly dist: number
  readonly look: Vec3
}

// Side views span the brain's 17 cm length, so they sit further back than the
// frontal ones; the stage is close to square.
const CAMERA_KEYS: readonly CameraKey[] = [
  { az: 0.9, el: 0.22, dist: 46, look: [0, 0, 0] },
  { az: 1.75, el: 0.12, dist: 45, look: [0, 0, 0] },
  { az: 2.65, el: 0.2, dist: 36, look: [0, 0.4, -1] },
  { az: 1.35, el: 0.32, dist: 44, look: [0, 0.2, 0] },
  { az: Math.PI, el: 0.08, dist: 36, look: [0, 0.8, -4] },
  { az: 4.1, el: -0.2, dist: 50, look: [0, -3, 0] },
]

function cameraAt(chapter: number): CameraKey {
  const c = MathUtils.clamp(chapter, 0, CAMERA_KEYS.length - 1)
  const index = Math.min(Math.floor(c), CAMERA_KEYS.length - 2)
  const f = c - index
  const eased = f * f * (3 - 2 * f)
  const a = CAMERA_KEYS[index]!
  const b = CAMERA_KEYS[index + 1]!
  return {
    az: MathUtils.lerp(a.az, b.az, eased),
    el: MathUtils.lerp(a.el, b.el, eased),
    dist: MathUtils.lerp(a.dist, b.dist, eased),
    look: [
      MathUtils.lerp(a.look[0], b.look[0], eased),
      MathUtils.lerp(a.look[1], b.look[1], eased),
      MathUtils.lerp(a.look[2], b.look[2], eased),
    ],
  }
}

const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

interface Pulse {
  readonly points: readonly Vec3[]
  readonly lengths: readonly number[]
  readonly color: Color
  readonly speed: number
  readonly strength: number
  t: number
}

export async function createBrainScene(options: BrainOptions): Promise<BrainController> {
  const { signal, canvas, host, isReducedMotion, labels, labelSpecs } = options

  const { model, graph } = await loadAssets()
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.setClearColor(0x000000, 0)
  const scene = new Scene()
  const camera = new PerspectiveCamera(30, 1, 0.5, 400)
  const root = new Group()
  scene.add(root)

  const story: BrainStory = buildStory(graph)
  const nodeCount = graph.nodes.length
  const access = graph.nodes.map((_, index) => nodeAccess(graph, index))

  // ---- brain meshes ------------------------------------------------------------------------
  const shellUniforms: Uniforms = {
    uBase: { value: new Color(0.1, 0.22, 0.4) },
    uDeep: { value: new Color(0.02, 0.05, 0.1) },
    uRim: { value: new Color(0.36, 0.72, 1.0) },
    uOpacity: { value: 0.92 },
    uGlow: { value: 0 },
    uHot: { value: Array.from({ length: HOT_SPOTS }, () => new Vector4(0, 0, 0, 0)) },
  }
  const shellMaterial = shader(shellUniforms, SHELL_VERTEX, SHELL_FRAGMENT)
  const innerUniforms: Uniforms = { uColor: { value: new Color(1.0, 0.7, 0.34) }, uBoost: { value: 0 } }
  const innerMaterial = shader(innerUniforms, INNER_VERTEX, INNER_FRAGMENT, { blending: AdditiveBlending })
  const brain = model.clone(true)
  const geometries: BufferGeometry[] = []
  brain.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const isShell = /^(hemisphere|cerebellum|brainstem)/.test(object.name)
    object.geometry.computeVertexNormals()
    object.material = isShell ? shellMaterial : innerMaterial
    object.renderOrder = isShell ? 10 : 3
    geometries.push(object.geometry)
  })
  root.add(brain)

  // ---- nodes --------------------------------------------------------------------------------
  const order = Array.from({ length: nodeCount }, (_, i) => ({ i, h: hash(i + 7) })).sort((a, b) => a.h - b.h)
  const arrival = new Float32Array(nodeCount)
  order.forEach(({ i }, rank) => {
    arrival[i] = -0.45 + (rank / nodeCount) * 0.95
  })
  const nodePositions = new Float32Array(nodeCount * 3)
  const nodeColors = new Float32Array(nodeCount * 3)
  const nodeState = new Float32Array(nodeCount)
  const nodeAct = new Float32Array(nodeCount)
  graph.nodes.forEach((node, i) => {
    nodePositions.set(node.p, i * 3)
    const color = REGION_COLORS[node.r] ?? REGION_COLORS[0]!
    nodeColors.set([color.r, color.g, color.b], i * 3)
    nodeState[i] = access[i] === 'open' ? 1 : access[i] === 'role' ? 0.34 : 0.1
  })
  const nodeGeometry = new BufferGeometry()
  nodeGeometry.setAttribute('position', new BufferAttribute(nodePositions, 3))
  nodeGeometry.setAttribute('aCol', new BufferAttribute(nodeColors, 3))
  nodeGeometry.setAttribute('aOrder', new BufferAttribute(arrival, 1))
  nodeGeometry.setAttribute('aState', new BufferAttribute(nodeState, 1))
  const actAttribute = new BufferAttribute(nodeAct, 1)
  nodeGeometry.setAttribute('aAct', actAttribute)
  const sharedUniforms = {
    uC: { value: -1 },
    uScale: { value: 1 },
    uScope: { value: 0 },
    uTime: { value: 0 },
    uDraw: { value: 0 },
    uGlow: { value: 1 },
  }
  const nodeMaterial = shader(
    { uC: sharedUniforms.uC, uScale: sharedUniforms.uScale, uScope: sharedUniforms.uScope },
    NODE_VERTEX,
    GLOW_FRAGMENT,
    { blending: AdditiveBlending },
  )
  const nodePoints = new Points(nodeGeometry, nodeMaterial)
  nodePoints.frustumCulled = false
  nodePoints.renderOrder = 6
  root.add(nodePoints)

  // ---- sparks: records arriving from outside ------------------------------------------------
  const sparkStart = new Float32Array(nodeCount * 3)
  const sparkCtrl = new Float32Array(nodeCount * 3)
  graph.nodes.forEach((node, i) => {
    const a = hash(i + 1) * Math.PI * 2
    const b = Math.acos(2 * hash(i + 91) - 1)
    const r = 22 + hash(i + 33) * 8
    const start: Vec3 = [Math.sin(b) * Math.cos(a) * r, Math.cos(b) * r * 0.8, Math.sin(b) * Math.sin(a) * r]
    sparkStart.set(start, i * 3)
    const bend = 5 + hash(i + 5) * 6
    sparkCtrl.set([start[0] * 0.5 + node.p[0] * 0.5 + bend * (hash(i + 8) - 0.5), start[1] * 0.5 + node.p[1] * 0.5 + bend, start[2] * 0.5 + node.p[2] * 0.5], i * 3)
  })
  const sparkGeometry = new BufferGeometry()
  sparkGeometry.setAttribute('position', new BufferAttribute(nodePositions, 3))
  sparkGeometry.setAttribute('aStart', new BufferAttribute(sparkStart, 3))
  sparkGeometry.setAttribute('aCtrl', new BufferAttribute(sparkCtrl, 3))
  sparkGeometry.setAttribute('aTime', new BufferAttribute(arrival, 1))
  const sparkMaterial = shader({ uC: sharedUniforms.uC, uScale: sharedUniforms.uScale }, SPARK_VERTEX, GLOW_FRAGMENT, {
    blending: AdditiveBlending,
  })
  const sparks = new Points(sparkGeometry, sparkMaterial)
  sparks.frustumCulled = false
  sparks.renderOrder = 7
  root.add(sparks)

  // ---- edges --------------------------------------------------------------------------------
  const edgePolylines = graph.edges.map(([a, b], index) =>
    edgePolyline(graph.nodes[a]!.p, graph.nodes[b]!.p, index + 1, EDGE_SEGMENTS),
  )
  const vertsPerEdge = EDGE_SEGMENTS * 2
  const edgeCount = graph.edges.length
  const edgePos = new Float32Array(edgeCount * vertsPerEdge * 3)
  const edgeT = new Float32Array(edgeCount * vertsPerEdge)
  const edgeRank = new Float32Array(edgeCount * vertsPerEdge)
  const edgeOrigin = new Float32Array(edgeCount * vertsPerEdge)
  const edgeActive = new Float32Array(edgeCount * vertsPerEdge)
  const edgeScope = new Float32Array(edgeCount * vertsPerEdge)
  graph.edges.forEach(([a, b, origin], e) => {
    const points = edgePolylines[e]!
    const rank = hash(e + 21)
    const scoped = access[a] === 'open' && access[b] === 'open' ? 1 : 0.18
    for (let s = 0; s < EDGE_SEGMENTS; s += 1) {
      for (let end = 0; end < 2; end += 1) {
        const v = e * vertsPerEdge + s * 2 + end
        const p = points[s + end]!
        edgePos.set(p, v * 3)
        edgeT[v] = (s + end) / EDGE_SEGMENTS
        edgeRank[v] = rank
        edgeOrigin[v] = origin
        edgeScope[v] = scoped
      }
    }
  })
  const edgeGeometry = new BufferGeometry()
  edgeGeometry.setAttribute('position', new BufferAttribute(edgePos, 3))
  edgeGeometry.setAttribute('aT', new BufferAttribute(edgeT, 1))
  edgeGeometry.setAttribute('aRank', new BufferAttribute(edgeRank, 1))
  edgeGeometry.setAttribute('aOrigin', new BufferAttribute(edgeOrigin, 1))
  const edgeActAttribute = new BufferAttribute(edgeActive, 1)
  edgeGeometry.setAttribute('aAct', edgeActAttribute)
  edgeGeometry.setAttribute('aScope', new BufferAttribute(edgeScope, 1))
  const edgeMaterial = shader(
    { uDraw: sharedUniforms.uDraw, uTime: sharedUniforms.uTime, uScope: sharedUniforms.uScope },
    EDGE_VERTEX,
    LINE_FRAGMENT,
    { blending: AdditiveBlending },
  )
  const edgeLines = new LineSegments(edgeGeometry, edgeMaterial)
  edgeLines.frustumCulled = false
  edgeLines.renderOrder = 5
  root.add(edgeLines)

  // ---- white-matter tracts ----------------------------------------------------------------
  const tractPolylines = graph.tracts.map((points) => points as readonly Vec3[])
  const tractVerts = tractPolylines.reduce((sum, points) => sum + (points.length - 1) * 2, 0)
  const tractPos = new Float32Array(tractVerts * 3)
  const tractT = new Float32Array(tractVerts)
  const tractSeed = new Float32Array(tractVerts)
  let cursor = 0
  tractPolylines.forEach((points, t) => {
    for (let i = 0; i < points.length - 1; i += 1) {
      for (let end = 0; end < 2; end += 1) {
        tractPos.set(points[i + end]!, cursor * 3)
        tractT[cursor] = (i + end) / (points.length - 1)
        tractSeed[cursor] = hash(t + 3)
        cursor += 1
      }
    }
  })
  const tractGeometry = new BufferGeometry()
  tractGeometry.setAttribute('position', new BufferAttribute(tractPos, 3))
  tractGeometry.setAttribute('aT', new BufferAttribute(tractT, 1))
  tractGeometry.setAttribute('aSeed', new BufferAttribute(tractSeed, 1))
  const tractMaterial = shader({ uTime: sharedUniforms.uTime, uGlow: sharedUniforms.uGlow }, TRACT_VERTEX, LINE_FRAGMENT, {
    blending: AdditiveBlending,
  })
  const tractLines = new LineSegments(tractGeometry, tractMaterial)
  tractLines.frustumCulled = false
  tractLines.renderOrder = 4
  root.add(tractLines)

  // ---- pulses ---------------------------------------------------------------------------------
  const pulsePos = new Float32Array(MAX_PULSES * 3)
  const pulseIntensity = new Float32Array(MAX_PULSES)
  const pulseColor = new Float32Array(MAX_PULSES * 3)
  const pulseGeometry = new BufferGeometry()
  pulseGeometry.setAttribute('position', new BufferAttribute(pulsePos, 3))
  const pulseIntensityAttr = new BufferAttribute(pulseIntensity, 1)
  const pulsePosAttr = pulseGeometry.getAttribute('position') as BufferAttribute
  const pulseColorAttr = new BufferAttribute(pulseColor, 3)
  pulseGeometry.setAttribute('aI', pulseIntensityAttr)
  pulseGeometry.setAttribute('aC', pulseColorAttr)
  const pulseMaterial = shader({ uScale: sharedUniforms.uScale }, PULSE_VERTEX, GLOW_FRAGMENT, { blending: AdditiveBlending })
  const pulsePoints = new Points(pulseGeometry, pulseMaterial)
  pulsePoints.frustumCulled = false
  pulsePoints.renderOrder = 8
  root.add(pulsePoints)
  const pulses: Pulse[] = []
  const spawnedEdges = new Set<number>()

  const spawn = (points: readonly Vec3[], color: Color, speed: number, strength: number): void => {
    if (pulses.length >= MAX_PULSES) return
    pulses.push({ points, lengths: cumulativeLengths(points), color, speed, strength, t: 0 })
  }

  // ---- citation path ----------------------------------------------------------------------------
  const pathPoints = story.path.map((i) => new Vector3(...graph.nodes[i]!.p))
  const pathCurve = new CatmullRomCurve3(pathPoints.length > 1 ? pathPoints : [pathPoints[0]!, pathPoints[0]!.clone().add(new Vector3(0, 0.1, 0))])
  const tubeUniforms: Uniforms = { uReveal: { value: 0 }, uTime: sharedUniforms.uTime }
  const tubeGeometry = new TubeGeometry(pathCurve, 200, 0.17, 8, false)
  const tube = new Mesh(tubeGeometry, shader(tubeUniforms, TUBE_VERTEX, TUBE_FRAGMENT, { blending: AdditiveBlending, side: DoubleSide }))
  tube.renderOrder = 9
  root.add(tube)

  // ---- approval gate and hash chain ---------------------------------------------------------------
  const gateCenter = new Vector3(0, 0.8, -11)
  const gate = new Group()
  gate.position.copy(gateCenter)
  const gateRingMaterial = new MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false })
  gate.add(new Mesh(new TorusGeometry(2.6, 0.08, 10, 96), gateRingMaterial))
  const gateDiscMaterial = new MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })
  gate.add(new Mesh(new CircleGeometry(2.5, 48), gateDiscMaterial))
  gate.renderOrder = 9
  root.add(gate)

  const chain = new Group()
  const chainEdgeMaterial = new LineBasicMaterial({ color: 0x8fb8ff, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false })
  const chainFillMaterial = new MeshBasicMaterial({ color: 0x2b5481, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false })
  const blockGeometry = new BoxGeometry(1.3, 0.55, 0.9)
  const blockEdges = new EdgesGeometry(blockGeometry)
  const blocks: Object3D[] = []
  const chainRadius = 11
  const chainY = -9.6
  for (let i = 0; i < CHAIN_BLOCKS; i += 1) {
    const block = new Group()
    const angle = (i / CHAIN_BLOCKS) * Math.PI * 2
    block.position.set(Math.cos(angle) * chainRadius, chainY, Math.sin(angle) * chainRadius)
    block.rotation.y = -angle
    block.add(new Mesh(blockGeometry, chainFillMaterial), new LineSegments(blockEdges, chainEdgeMaterial))
    block.visible = false
    chain.add(block)
    blocks.push(block)
  }
  const linkPoints = blocks.map((block) => block.position.clone())
  const linkGeometry = new BufferGeometry().setFromPoints(linkPoints)
  const linkMaterial = new LineBasicMaterial({ color: 0x5cc8ff, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false })
  const links = new LineLoop(linkGeometry, linkMaterial)
  chain.add(links)
  chain.renderOrder = 9
  root.add(chain)

  // ---- labels ---------------------------------------------------------------------------------------
  const labelAnchor = (id: string): Vector3 | null => {
    if (id === 'gate') return gateCenter.clone().add(new Vector3(2.6, 1.6, 0))
    if (id === 'chain') {
      const latest = Math.max(0, Math.min(CHAIN_BLOCKS - 1, Math.floor(chainProgress * CHAIN_BLOCKS) - 1))
      return blocks[latest]!.position.clone().add(new Vector3(0, 0.6, 0))
    }
    const pinned = story.pins[id]
    return pinned === undefined ? null : new Vector3(...graph.nodes[pinned]!.p)
  }

  // ---- state ------------------------------------------------------------------------------------------
  let chapter = isReducedMotion ? 0 : -0.5
  let chapterTarget = chapter
  let chapterSmooth = chapter
  let azimuthDrift = 0
  let dragAz = 0
  let dragVelocity = 0
  let isDragging = false
  let lastX = 0
  let pointerX = 0
  let pointerY = 0
  let smoothX = 0
  let smoothY = 0
  let isActive = true
  let isDisposed = false
  let frame = 0
  let last = performance.now()
  let width = 1
  let height = 1
  let ambientClock = 0
  let chainProgress = 0
  const hot = shellUniforms.uHot!.value as Vector4[]

  function updateActivation(c: number, time: number): void {
    const front = ((c - 1.55) / 0.9) * story.maxDistance
    const recallFade = 1 - smoothstep(2.5, 3.0, c) * 0.55
    const citeProgress = clamp01((c - 2.55) / 0.85)
    const citeFade = 1 - smoothstep(3.7, 4.4, c) * 0.5
    const pathIndex = new Map(story.path.map((node, k) => [node, k]))
    const pathReach = citeProgress * Math.max(story.path.length - 1, 1)
    for (let i = 0; i < nodeCount; i += 1) {
      let act = isReducedMotion ? 0.05 : 0.06 + 0.05 * Math.sin(time * 1.4 + i * 1.7)
      const d = story.distance[i] ?? Number.POSITIVE_INFINITY
      if (Number.isFinite(d) && c > 1.5) {
        act += clamp01(front - d + 0.7) * 0.8 * recallFade
      }
      const k = pathIndex.get(i)
      if (k !== undefined && c > 2.55) {
        act += smoothstep(k - 0.4, k + 0.4, pathReach) * 1.0 * citeFade
      }
      nodeAct[i] = act
    }
    actAttribute.needsUpdate = true
    for (let e = 0; e < edgeCount; e += 1) {
      const [a, b] = graph.edges[e]!
      const value = Math.min(nodeAct[a] ?? 0, nodeAct[b] ?? 0)
      edgeActive.fill(value, e * vertsPerEdge, (e + 1) * vertsPerEdge)
    }
    edgeActAttribute.needsUpdate = true
  }

  function updatePulses(c: number, dt: number): void {
    if (!isReducedMotion) {
      ambientClock += dt
      while (ambientClock > 0.32 && tractPolylines.length > 0) {
        ambientClock -= 0.32
        const t = Math.floor(Math.random() * tractPolylines.length)
        spawn(tractPolylines[t]!, new Color(0x8fb8ff), 0.28 + Math.random() * 0.2, 0.55)
      }
    }
    // recall wave: spawn once per edge as the front crosses it
    if (c > 1.5 && c < 3.2) {
      const front = ((c - 1.55) / 0.9) * story.maxDistance
      graph.edges.forEach(([a, b], e) => {
        if (spawnedEdges.has(e)) return
        const da = story.distance[a] ?? Number.POSITIVE_INFINITY
        const db = story.distance[b] ?? Number.POSITIVE_INFINITY
        if (!Number.isFinite(da) || !Number.isFinite(db)) return
        if (Math.min(da, db) <= front) {
          spawnedEdges.add(e)
          const points = edgePolylines[e]!
          const forward = da <= db
          spawn(forward ? points : [...points].reverse(), GOLD, 0.9, 1)
        }
      })
    } else if (c < 1.4) {
      spawnedEdges.clear()
    }
    // approval stream: question toward the gate
    if (c > 3.6 && c < 4.15 && Math.random() < dt * 14) {
      const from = graph.nodes[story.queryNode]!.p
      const mid: Vec3 = [from[0] * 0.5, from[1] + 1.4, (from[2] + gateCenter.z) / 2]
      spawn([from, mid, [gateCenter.x, gateCenter.y, gateCenter.z]], GOLD, 0.7, 1)
    }
    // action spark leaving the gate once approved
    if (c > 4.15 && c < 4.6 && Math.random() < dt * 9) {
      spawn([[0, 0.8, -11], [0, 0.9, -15], [0, 1.0, -21]], GREEN, 0.9, 1)
    }
    for (let i = pulses.length - 1; i >= 0; i -= 1) {
      const pulse = pulses[i]!
      pulse.t += dt * pulse.speed
      if (pulse.t >= 1) pulses.splice(i, 1)
    }
    pulseIntensity.fill(0)
    pulses.forEach((pulse, i) => {
      const p = samplePolyline(pulse.points, pulse.lengths, pulse.t)
      pulsePos.set(p, i * 3)
      pulseIntensity[i] = pulse.strength * Math.sin(Math.min(pulse.t, 1) * Math.PI)
      pulseColor.set([pulse.color.r, pulse.color.g, pulse.color.b], i * 3)
    })
    pulsePosAttr.needsUpdate = true
    pulseIntensityAttr.needsUpdate = true
    pulseColorAttr.needsUpdate = true
  }

  function applyChapter(c: number, time: number, dt: number): void {
    sharedUniforms.uC.value = c
    sharedUniforms.uTime.value = time
    sharedUniforms.uScope.value = smoothstep(1.4, 1.95, c)
    sharedUniforms.uDraw.value = clamp01((c - 0.5) / 0.95)
    sharedUniforms.uGlow.value = 0.7 + 0.5 * smoothstep(-0.4, 0.6, c)

    updateActivation(c, time)
    updatePulses(c, dt)

    // glow on the cortex where the strongest memories sit
    const ranked = Array.from({ length: nodeCount }, (_, i) => i)
      .sort((a, b) => (nodeAct[b] ?? 0) - (nodeAct[a] ?? 0))
      .slice(0, HOT_SPOTS)
    ranked.forEach((index, k) => {
      const p = graph.nodes[index]!.p
      hot[k]!.set(p[0], p[1], p[2], Math.min(nodeAct[index] ?? 0, 1.2) * 0.9)
    })
    shellUniforms.uGlow!.value = smoothstep(-0.4, 0.6, c) * 0.6 + smoothstep(4.5, 5.2, c) * 0.5
    innerUniforms.uBoost!.value = 0.3 * smoothstep(-0.5, 0.4, c) + 0.5 * smoothstep(4.6, 5.3, c) + 0.15 * Math.sin(time * 1.2)

    // citation tube
    tubeUniforms.uReveal!.value = clamp01((c - 2.55) / 0.85)

    // approval gate: gold while waiting, green once approved
    const show = smoothstep(3.5, 3.8, c) * (1 - smoothstep(4.6, 5.0, c))
    const approved = smoothstep(4.1, 4.25, c)
    const color = GOLD.clone().lerp(GREEN, approved)
    gateRingMaterial.color.copy(color)
    gateDiscMaterial.color.copy(color)
    gateRingMaterial.opacity = show * (0.55 + 0.35 * Math.sin(time * 3 + approved * 6) * (1 - approved) + approved * 0.3)
    gateDiscMaterial.opacity = show * (0.06 + approved * 0.12)
    gate.rotation.z = time * 0.25
    gate.scale.setScalar(0.85 + 0.15 * show)

    // hash chain grows block by block
    chainProgress = clamp01((c - 4.55) / 0.8)
    const visibleBlocks = Math.floor(chainProgress * CHAIN_BLOCKS)
    blocks.forEach((block, i) => {
      block.visible = i < visibleBlocks
    })
    links.visible = visibleBlocks > 2
    linkMaterial.opacity = 0.2 + 0.4 * chainProgress
    chain.rotation.y = time * 0.08
    const chainColor = NAVY_EDGE.clone().lerp(new Color(0x8fb8ff), chainProgress)
    chainFillMaterial.color.copy(chainColor)
  }

  function render(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const time = now / 1000
    chapterSmooth += (chapterTarget - chapterSmooth) * (1 - Math.exp(-Math.min(0.25, dt * 3) * 4))
    chapter = isReducedMotion ? chapterTarget : chapterSmooth
    applyChapter(chapter, time, isReducedMotion ? 0 : dt)

    // a small sway around each chapter's designed angle, never an unbounded spin
    if (!isReducedMotion && !isDragging) azimuthDrift = Math.sin(time * 0.2) * 0.14
    dragAz += dragVelocity
    dragVelocity *= isDragging ? 0 : 0.94
    smoothX += (pointerX - smoothX) * (1 - Math.exp(-dt * 3))
    smoothY += (pointerY - smoothY) * (1 - Math.exp(-dt * 3))
    const key = cameraAt(chapter)
    const aspect = width / Math.max(height, 1)
    const fit = Math.max(1, 1.05 / aspect)
    const az = key.az + azimuthDrift + dragAz + smoothX * 0.16
    const el = key.el - smoothY * 0.05
    const dist = key.dist * fit * (1 + 0.02 * Math.sin(time * 0.5))
    camera.position.set(
      key.look[0] + Math.sin(az) * Math.cos(el) * dist,
      key.look[1] + Math.sin(el) * dist,
      key.look[2] + Math.cos(az) * Math.cos(el) * dist,
    )
    camera.lookAt(key.look[0], key.look[1], key.look[2])
    camera.updateMatrixWorld()

    const shown: { element: HTMLElement; y: number }[] = []
    for (const spec of labelSpecs) {
      const element = labels[spec.id]
      const world = labelAnchor(spec.id)
      if (!element || !world) continue
      const projected = world.project(camera)
      const isOn = chapter >= spec.from && chapter <= spec.to && projected.z < 1
      element.dataset.on = isOn ? 'true' : 'false'
      const y = ((1 - projected.y) / 2) * height
      element.style.transform = `translate3d(${(((projected.x + 1) / 2) * width).toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      if (isOn) shown.push({ element, y })
    }
    // cards that would sit on top of each other step apart; the dots stay on their nodes
    const gap = width < 700 ? 30 : 50
    const taken: number[] = []
    shown
      .sort((a, b) => a.y - b.y)
      .forEach(({ element, y }) => {
        let offset = 0
        for (let guard = 0; guard < 10 && taken.some((t) => Math.abs(y + offset - t) < gap); guard += 1) {
          offset += gap * 0.6
        }
        taken.push(y + offset)
        element.style.setProperty('--dy', `${offset.toFixed(0)}px`)
      })
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
    if (isReducedMotion) render(last)
    else frame = requestAnimationFrame(loop)
  }

  // ---- input ---------------------------------------------------------------------------------------------
  const onPointerMove = (event: PointerEvent): void => {
    const box = host.getBoundingClientRect()
    pointerX = ((event.clientX - box.left) / box.width) * 2 - 1
    pointerY = ((event.clientY - box.top) / box.height) * 2 - 1
    if (isDragging) {
      const dx = event.clientX - lastX
      lastX = event.clientX
      dragAz += dx * 0.006
      dragVelocity = dx * 0.001
    }
  }
  const onPointerDown = (event: PointerEvent): void => {
    isDragging = true
    lastX = event.clientX
    canvas.setPointerCapture(event.pointerId)
  }
  const onPointerUp = (event: PointerEvent): void => {
    isDragging = false
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
  }
  const onPointerLeave = (): void => {
    pointerX = 0
    pointerY = 0
  }
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('pointerleave', onPointerLeave)

  function resize(): void {
    width = Math.max(1, host.clientWidth)
    height = Math.max(1, host.clientHeight)
    const ratio = Math.min(window.devicePixelRatio || 1, width < 700 ? 1.5 : 2)
    renderer.setPixelRatio(ratio)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    sharedUniforms.uScale.value = (height * ratio) / Math.tan(MathUtils.degToRad(camera.fov / 2))
    if (isReducedMotion) render(performance.now())
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()
  start()

  return {
    setChapter(next) {
      chapterTarget = next
      if (isReducedMotion) render(performance.now())
    },
    setActive(next) {
      if (next === isActive) return
      isActive = next
      if (next) start()
      else cancelAnimationFrame(frame)
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
      ;[nodeGeometry, sparkGeometry, edgeGeometry, tractGeometry, pulseGeometry, tubeGeometry, linkGeometry, blockGeometry, blockEdges].forEach((g) => g.dispose())
      ;[shellMaterial, innerMaterial, nodeMaterial, sparkMaterial, edgeMaterial, tractMaterial, pulseMaterial, gateRingMaterial, gateDiscMaterial, chainEdgeMaterial, chainFillMaterial, linkMaterial].forEach((m) => m.dispose())
      if (tube.material instanceof ShaderMaterial) tube.material.dispose()
      geometries.length = 0
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
