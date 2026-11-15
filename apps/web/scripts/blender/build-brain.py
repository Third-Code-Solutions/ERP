"""
Builds the Cortex section brain in Blender.

    blender -b -P build-brain.py -- \
        --glb ../../public/models/abi-brain.glb \
        --graph ../../public/models/abi-brain-graph.json \
        [--still ../../public/images/abi-brain-still.webp]

Outputs
  abi-brain.glb         two folded hemispheres, cerebellum, brainstem and the
                        deep structures (hippocampi, thalamus, amygdalae,
                        corpus callosum). The groove depth is baked into the
                        vertex colour (R) so the web shader can darken sulci.
  abi-brain-graph.json  the "memory" network drawn inside the brain: nodes,
                        edges and long white-matter tracts, already in glTF
                        axes (Y up, frontal lobe toward -Z).

Units are centimetres. Blender axes: +Y frontal, +Z up, +X right.
"""
import bmesh
import bpy
import json
import math
import random
import sys
from mathutils import Vector, kdtree, noise

RX, RY, RZ = 7.0, 8.7, 5.7        # half extents of the base ellipsoid
GAP = 0.22                        # half width of the longitudinal fissure
SUBDIV = 6


def args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    out = {"glb": "abi-brain.glb", "graph": "abi-brain-graph.json", "still": None}
    for i, a in enumerate(argv):
        if a in ("--glb", "--graph", "--still"):
            out[a[2:]] = argv[i + 1]
    return out


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# --------------------------------------------------------------------------
# Brain shape
# --------------------------------------------------------------------------
def shape(u):
    """Maps a point of the unit ball to brain space (no folds)."""
    x, y, z = u
    taper = 1.0
    if y > 0:
        taper -= 0.17 * (y ** 1.6)
    else:
        taper -= 0.22 * ((-y) ** 1.8)
    px, py, pz = x * RX * taper, y * RY, z * RZ
    if pz < 0:
        pz *= 0.74
    temporal = (
        math.exp(-((y - 0.05) / 0.42) ** 2)
        * math.exp(-((z + 0.55) / 0.30) ** 2)
        * min(1.0, abs(x) * 1.6)
    )
    pz -= 0.9 * temporal
    px *= 1 + 0.05 * temporal
    return Vector((px, py, pz))


def grooves(p, offset):
    """Sulcus masks at two scales: 1 in a groove, 0 on a ridge."""
    q = p * 0.85 + offset
    warp = Vector(noise.noise_vector(q * 0.55 + Vector((7.1, 3.3, 1.7)))) * 0.7
    n1 = noise.noise(q + warp)
    g1 = 1.0 - smoothstep(0.0, 0.30, abs(n1))
    q2 = p * 1.7 + offset * 1.7
    warp2 = Vector(noise.noise_vector(q2 * 0.5)) * 0.5
    n2 = noise.noise(q2 + warp2)
    g2 = 1.0 - smoothstep(0.0, 0.22, abs(n2))
    return g1, g2


def new_object(name, bm, material):
    mesh = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    bpy.context.collection.objects.link(obj)
    return obj


def make_material(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.5
    return mat


def hemisphere(side, mat):
    """side = +1 right, -1 left."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=SUBDIV, radius=1.0)
    geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
    bmesh.ops.bisect_plane(
        bm, geom=geom, plane_co=(0, 0, 0), plane_no=(1, 0, 0),
        clear_inner=(side > 0), clear_outer=(side < 0),
    )
    bmesh.ops.holes_fill(bm, edges=bm.edges[:], sides=0)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])

    offset = Vector((side * 3.7, 1.3, 0.4))
    layer = bm.loops.layers.color.new("Col")
    grove = {}
    medial_ids = set()
    for v in bm.verts:
        u = v.co.normalized()
        base = shape(u)
        g1, g2 = grooves(base, offset)
        fine = noise.noise(base * 2.4 + offset) * 0.02
        depth = -(0.52 * g1 ** 1.3 + 0.18 * g2 * (1.0 - g1)) + 0.14 * (1.0 - g1) + fine
        # keep the medial plane flat so the two halves meet cleanly
        medial = 1.0 - smoothstep(0.0, 0.18, abs(u.x))
        depth *= (1.0 - medial)
        p = base + u * depth
        v.co = p
        if abs(u.x) < 1e-6:
            medial_ids.add(v.index)
        grove[v.index] = max(0.0, min(1.0, g1 + 0.5 * g2 * (1.0 - g1)))
    bmesh.ops.smooth_vert(bm, verts=bm.verts[:], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bmesh.ops.smooth_vert(bm, verts=bm.verts[:], factor=0.35, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    for v in bm.verts:
        if v.index in medial_ids:
            v.co.x = 0.0
        v.co.x += side * GAP
    for face in bm.faces:
        for loop in face.loops:
            g = grove[loop.vert.index]
            loop[layer] = (g, 0.0, 0.0, 1.0)
    return new_object("hemisphere_R" if side > 0 else "hemisphere_L", bm, mat)


def cerebellum(mat):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=5, radius=1.0)
    layer = bm.loops.layers.color.new("Col")
    folia = {}
    for v in bm.verts:
        u = v.co.normalized()
        p = Vector((u.x * 4.6, u.y * 2.9 - 6.6, u.z * 2.3 - 3.7))
        ridge = abs(math.sin(p.z * 6.2 + noise.noise(p * 0.8) * 2.0))
        d = -0.16 * (1.0 - smoothstep(0.0, 0.55, ridge))
        d -= 0.45 * math.exp(-(u.x / 0.16) ** 2)
        v.co = p + u * d
        folia[v.index] = 0.6 * (1.0 - smoothstep(0.0, 0.55, ridge))
    for face in bm.faces:
        for loop in face.loops:
            loop[layer] = (folia[loop.vert.index], 0.0, 0.0, 1.0)
    return new_object("cerebellum", bm, mat)


def tube(points, radii, sides=10):
    """Sweeps a circle along `points`; returns a bmesh."""
    bm = bmesh.new()
    rings = []
    n = len(points)
    for i, point in enumerate(points):
        a = (points[min(i + 1, n - 1)] - points[max(i - 1, 0)]).normalized()
        helper = Vector((0, 0, 1)) if abs(a.z) < 0.9 else Vector((1, 0, 0))
        u = a.cross(helper).normalized()
        w = a.cross(u)
        ring = []
        for k in range(sides):
            ang = 2 * math.pi * k / sides
            off = u * (math.cos(ang) * radii[i]) + w * (math.sin(ang) * radii[i])
            ring.append(bm.verts.new(point + off))
        rings.append(ring)
    for i in range(n - 1):
        for k in range(sides):
            j = (k + 1) % sides
            bm.faces.new((rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]))
    return bm


def bezier(points, steps):
    """Catmull-Rom through `points`."""
    out = []
    n = len(points)
    for i in range(n - 1):
        p0 = points[max(i - 1, 0)]
        p1, p2 = points[i], points[i + 1]
        p3 = points[min(i + 2, n - 1)]
        for s in range(steps):
            t = s / steps
            t2, t3 = t * t, t * t * t
            out.append(
                0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            )
    out.append(points[-1])
    return out


def ellipsoid(name, center, radii, mat, sub=3):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2])) + Vector(center)
    return new_object(name, bm, mat)


def deep_structures(mat, stem_mat):
    for side, tag in ((1, "R"), (-1, "L")):
        pts = [Vector((side * (3.4 + 0.9 * math.sin(math.pi * t)), 1.1 - 5.6 * t, -2.3 + 1.5 * math.sin(math.pi * t * 0.92))) for t in [i / 7 for i in range(8)]]
        radii = [0.55 - 0.22 * (i / 7) for i in range(8)]
        new_object(f"hippocampus_{tag}", tube(bezier(pts, 4), [0.55 - 0.25 * (i / 28) for i in range(29)]), mat)
        ellipsoid(f"amygdala_{tag}", (side * 3.3, 1.5, -2.9), (0.85, 0.85, 0.75), mat)
    ellipsoid("thalamus", (0, 0.0, -0.3), (1.9, 1.5, 1.1), mat, 3)
    arch = [Vector((0, 4.6 - 9.2 * t, 1.6 + 1.5 * math.sin(math.pi * t) ** 0.8)) for t in [i / 9 for i in range(10)]]
    new_object("corpus_callosum", tube(bezier(arch, 4), [0.62] * 37, 10), mat)
    stem = [Vector((0, -0.9 - 1.0 * t, -2.6 - 6.4 * t)) for t in [i / 6 for i in range(7)]]
    new_object("brainstem", tube(bezier(stem, 4), [1.55 - 0.65 * (i / 24) for i in range(25)], 12), stem_mat)


# --------------------------------------------------------------------------
# Memory graph
# --------------------------------------------------------------------------
# Record types, in the order the web scene indexes them (label, region weights)
TYPES = [
    "Project", "Opportunity", "Account", "Contract", "Scope Item", "BOM", "BOM Line",
    "RFQ", "Vendor", "Purchase Order", "Delivery", "Invoice", "Claim", "Cost Entry",
    "Task", "Inspection", "Punchlist", "Document", "Permit", "Variation Order", "Person",
]
# region -> type indices that live there
REGION_TYPES = {
    0: [1, 2, 3, 0],                 # frontal: commercial
    1: [4, 5, 6, 7, 8, 9],           # parietal: estimate and buy
    2: [17, 18, 19, 20],             # temporal: documents and people
    3: [10, 14, 15, 16],             # occipital: site work
    4: [11, 12, 13, 0],              # deep: money
}


def region_of(p):
    x, y, z = p
    if abs(x) < 3.4 and abs(z) < 1.9 and abs(y) < 3.2:
        return 4
    if y > 2.4:
        return 0
    if y < -3.6:
        return 3
    if z < -0.6 and abs(y) < 3.6:
        return 2
    return 1


def to_gltf(p):
    return [round(p[0], 3), round(p[2], 3), round(-p[1], 3)]


def sample_nodes(count, seed=11):
    rnd = random.Random(seed)
    tree_points = []
    nodes = []
    attempts = 0
    while len(nodes) < count and attempts < 20000:
        attempts += 1
        u = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
        if u.length > 0.88:
            continue
        p = shape(u) * 0.94
        p.x += GAP * (1 if p.x >= 0 else -1)
        if any((p - q).length < 1.25 for q in tree_points):
            continue
        tree_points.append(p)
        region = region_of(p)
        type_index = rnd.choice(REGION_TYPES[region])
        nodes.append({"p": p, "r": region, "t": type_index, "k": 1 if rnd.random() < 0.15 else 0})
    return nodes


def build_edges(nodes, seed=5):
    rnd = random.Random(seed)
    tree = kdtree.KDTree(len(nodes))
    for i, n in enumerate(nodes):
        tree.insert(n["p"], i)
    tree.balance()
    seen = set()
    edges = []

    def add(a, b):
        key = (min(a, b), max(a, b))
        if a == b or key in seen:
            return
        seen.add(key)
        roll = rnd.random()
        origin = 0 if roll < 0.6 else (1 if roll < 0.9 else 2)  # canonical, derived, ai
        edges.append([key[0], key[1], origin])

    for i, n in enumerate(nodes):
        for _, j, _ in tree.find_n(n["p"], 4)[1:3]:
            add(i, j)
        if rnd.random() < 0.28:
            _, j, _ = rnd.choice(tree.find_n(n["p"], 9)[4:])
            add(i, j)
    return edges


def tracts():
    def mirror(points):
        return [Vector((-p.x, p.y, p.z)) for p in points]

    base = {
        "arcuate": [Vector(p) for p in [(3.4, 5.6, 1.6), (5.0, 3.0, 3.0), (5.6, 0.0, 2.6), (5.0, -2.6, 0.2), (4.4, -3.4, -2.0)]],
        "cingulum": [Vector(p) for p in [(1.0, 5.8, 1.0), (1.0, 3.0, 3.0), (1.1, -2.0, 3.1), (1.6, -5.0, 0.8), (2.8, -3.4, -2.0)]],
        "fornix": [Vector(p) for p in [(3.9, -3.4, -2.5), (2.4, -1.4, 0.3), (1.0, 0.6, 1.2), (0.9, 2.6, 0.2)]],
        "optic": [Vector(p) for p in [(2.4, -0.6, -0.8), (4.0, -4.2, 0.6), (2.6, -7.4, 0.9)]],
        "thalamic": [Vector(p) for p in [(2.8, 5.0, 0.9), (1.7, 1.4, 0.3), (1.3, 0.0, -0.3)]],
        "uncinate": [Vector(p) for p in [(3.2, 5.8, -1.0), (4.8, 2.8, -2.0), (4.2, 0.6, -2.6)]],
    }
    out = []
    for key, pts in base.items():
        for variant in range(2):
            wobble = [pt + Vector((0.18 * variant, 0.14 * variant, -0.16 * variant)) for pt in pts]
            for side in (1, -1):
                use = wobble if side > 0 else mirror(wobble)
                out.append([to_gltf(p) for p in bezier(use, 6)])
    for y in (4.2, 2.2, 0.2, -1.8, -3.8):
        arc = [Vector((-5.0, y, 2.2)), Vector((-2.4, y, 3.7)), Vector((0, y, 4.2)), Vector((2.4, y, 3.7)), Vector((5.0, y, 2.2))]
        out.append([to_gltf(p) for p in bezier(arc, 6)])
    return out


def export_graph(path):
    nodes = sample_nodes(150)
    edges = build_edges(nodes)
    data = {
        "types": TYPES,
        "nodes": [{"p": to_gltf(n["p"]), "r": n["r"], "t": n["t"], "k": n["k"]} for n in nodes],
        "edges": edges,
        "tracts": tracts(),
        "anchors": {
            "query": to_gltf(Vector((0.6, 6.6, 2.4))),
            "gate": to_gltf(Vector((0.0, 7.6, 0.8))),
            "hippocampusR": to_gltf(Vector((3.6, -2.2, -2.2))),
            "hippocampusL": to_gltf(Vector((-3.6, -2.2, -2.2))),
            "thalamus": to_gltf(Vector((0, 0, -0.3))),
        },
    }
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, separators=(",", ":"))
    print("graph", len(nodes), "nodes", len(edges), "edges", len(data["tracts"]), "tracts")


# --------------------------------------------------------------------------
# Build, export, still
# --------------------------------------------------------------------------
def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mat = make_material("cortex", (0.8, 0.82, 0.86))
    inner = make_material("inner", (0.88, 0.48, 0.16))
    hemisphere(1, mat)
    hemisphere(-1, mat)
    cerebellum(mat)
    deep_structures(inner, mat)


def smooth_all():
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            for poly in obj.data.polygons:
                poly.use_smooth = True


def export_glb(path):
    smooth_all()
    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_image_format="NONE",
        export_texcoords=False,
        export_normals=False,
        export_vertex_color="ACTIVE",
        export_cameras=False,
        export_lights=False,
        export_draco_mesh_compression_enable=False,
    )


def render_still(path):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.film_transparent = True
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 1100
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.quality = 84
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = path

    for obj in bpy.data.objects:
        if obj.name.startswith("hemisphere") or obj.name == "cerebellum":
            nt = bpy.data.materials["cortex"].node_tree
    cortex = bpy.data.materials["cortex"]
    nodes, links = cortex.node_tree.nodes, cortex.node_tree.links
    attr = nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "Col"
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.62, 0.80, 0.98, 1)
    ramp.color_ramp.elements[1].color = (0.02, 0.06, 0.14, 1)
    split = nodes.new("ShaderNodeSeparateColor")
    links.new(attr.outputs["Color"], split.inputs["Color"])
    links.new(split.outputs["Red"], ramp.inputs["Fac"])
    bsdf = nodes["Principled BSDF"]
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.38
    links.new(ramp.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 0.55

    for name, power, loc in (("key", 3.4, (60, -70, 60)), ("rim", 2.0, (-70, 50, 30))):
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
        light.data.energy = power
        light.location = loc
        light.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        bpy.context.collection.objects.link(light)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 70
    cam.location = (46, -28, 12)
    cam.rotation_euler = (Vector((0, -1.2, -0.8)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    opts = args()
    build()
    export_glb(opts["glb"])
    export_graph(opts["graph"])
    if opts["still"]:
        render_still(opts["still"])
    print("DONE")
