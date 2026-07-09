import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Opportunity } from '../types'
import { SECTOR_LABEL } from '../types'
import { BOROUGH_TILES } from '../data'
import { scoreBand, totalScore } from '../model'
import { Card, SectionTitle } from '../ui'

/*
  The 3D model view — an architectural massing model of the London radar.
  Boroughs are extruded blocks (height = opportunity count), opportunities
  are data-point nodes above them coloured by sector, and fine wires arc
  between nodes of the same sector with slow pulses travelling along them.
  Built with three.js bundled locally: no map tiles, no API keys, works
  offline — swappable for deck.gl/Mapbox when live data arrives.
*/

const PAPER = 0xf4f4f1
const CARD = 0xfcfcfb
const INSET = 0xefefe9
const INK = 0x151513
const INK_SOFT = 0x55534c
const OFFICE = 0x2a78d6
const LIVING = 0x1baf7a

const SP = 1.16 // grid spacing
const COLS = 8
const ROWS = 7

interface NodeMeta {
  kind: 'node'
  opp: Opportunity
}
interface BlockMeta {
  kind: 'block'
  name: string
  count: number
}
type Meta = NodeMeta | BlockMeta

function gridPos(col: number, row: number): [number, number] {
  return [(col - (COLS - 1) / 2) * SP, (row - (ROWS - 1) / 2) * SP]
}

function labelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.font = '600 30px "Geist Sans", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#55534c'
  ctx.fillText(text, 64, 34)
  const texture = new THREE.CanvasTexture(canvas)
  texture.anisotropy = 4
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }))
  sprite.scale.set(0.78, 0.39, 1)
  return sprite
}

export function ModelView({
  opportunities,
  onOpen,
}: {
  opportunities: Opportunity[]
  onOpen: (id: string) => void
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen
  const [tip, setTip] = useState<{ x: number; y: number; title: string; sub: string } | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(PAPER)
    scene.fog = new THREE.Fog(PAPER, 18, 34)

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    camera.position.set(7.5, 7.2, 10.8)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0.5, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 5
    controls.maxDistance = 24
    controls.maxPolarAngle = Math.PI * 0.44
    controls.autoRotate = !reducedMotion
    controls.autoRotateSpeed = 0.55

    // lights — soft museum daylight
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe8e5dc, 1.35))
    const sun = new THREE.DirectionalLight(0xfffdf8, 1.9)
    sun.position.set(6, 11, 4)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -8
    sun.shadow.camera.right = 8
    sun.shadow.camera.top = 8
    sun.shadow.camera.bottom = -8
    sun.shadow.bias = -0.0004
    scene.add(sun)

    // baseboard
    const ground = new THREE.Mesh(
      new THREE.CylinderGeometry(9.2, 9.2, 0.18, 64),
      new THREE.MeshStandardMaterial({ color: CARD, roughness: 0.95 }),
    )
    ground.position.y = -0.09
    ground.receiveShadow = true
    scene.add(ground)

    const counts = new Map<string, number>()
    for (const o of opportunities) counts.set(o.borough, (counts.get(o.borough) ?? 0) + 1)

    const pickables: THREE.Object3D[] = []

    // borough blocks
    const blockTop = new Map<string, number>()
    const blockPos = new Map<string, [number, number]>()
    for (const t of BOROUGH_TILES) {
      const [x, z] = gridPos(t.col, t.row)
      const count = counts.get(t.name) ?? 0
      const h = count > 0 ? 0.5 + 0.45 * (count - 1) : 0.07
      const geo = new THREE.BoxGeometry(1, h, 1)
      const mat = new THREE.MeshStandardMaterial({
        color: count > 0 ? CARD : INSET,
        roughness: 0.9,
      })
      const block = new THREE.Mesh(geo, mat)
      block.position.set(x, h / 2, z)
      block.castShadow = count > 0
      block.receiveShadow = true
      block.userData = { kind: 'block', name: t.name, count } satisfies BlockMeta
      scene.add(block)
      pickables.push(block)

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: count > 0 ? 0.35 : 0.1 }),
      )
      edges.position.copy(block.position)
      scene.add(edges)

      blockTop.set(t.name, h)
      blockPos.set(t.name, [x, z])

      if (count > 0) {
        const sprite = labelSprite(t.short)
        sprite.position.set(x, h + 0.34, z)
        scene.add(sprite)
      }
    }

    // opportunity nodes
    const nodeGeo = new THREE.SphereGeometry(0.11, 24, 18)
    const perBoroughIndex = new Map<string, number>()
    const nodePositions = new Map<string, THREE.Vector3>()
    for (const o of opportunities) {
      let pos: THREE.Vector3
      if (blockPos.has(o.borough)) {
        const idx = perBoroughIndex.get(o.borough) ?? 0
        perBoroughIndex.set(o.borough, idx + 1)
        const [x, z] = blockPos.get(o.borough)!
        pos = new THREE.Vector3(x, blockTop.get(o.borough)! + 0.62 + idx * 0.4, z)
      } else {
        // pan-London — floats above the centre of the model
        pos = new THREE.Vector3(0, 3.4, 0)
      }
      const color = o.sector === 'office-retrofit' ? OFFICE : LIVING
      const node = new THREE.Mesh(
        nodeGeo,
        new THREE.MeshStandardMaterial({ color, roughness: 0.35, emissive: color, emissiveIntensity: 0.18 }),
      )
      node.position.copy(pos)
      node.castShadow = true
      node.userData = { kind: 'node', opp: o } satisfies NodeMeta
      scene.add(node)
      pickables.push(node)

      // stem: a hairline tying the data point to its block
      if (blockPos.has(o.borough)) {
        const stem = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(pos.x, blockTop.get(o.borough)!, pos.z),
            pos.clone(),
          ]),
          new THREE.LineBasicMaterial({ color: INK_SOFT, transparent: true, opacity: 0.35 }),
        )
        scene.add(stem)
      }
      nodePositions.set(o.id, pos)
    }

    // sector wires + travelling pulses
    const pulses: { curve: THREE.QuadraticBezierCurve3; mesh: THREE.Mesh; t: number; speed: number }[] = []
    const pulseGeo = new THREE.SphereGeometry(0.045, 12, 10)
    for (const sector of ['office-retrofit', 'pbsa-living'] as const) {
      const color = sector === 'office-retrofit' ? OFFICE : LIVING
      const nodes = opportunities
        .filter((o) => o.sector === sector)
        .map((o) => nodePositions.get(o.id)!)
        .sort((a, b) => a.x - b.x || a.z - b.z)
      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i]
        const b = nodes[i + 1]
        const mid = a.clone().add(b).multiplyScalar(0.5)
        mid.y = Math.max(a.y, b.y) + Math.max(0.7, a.distanceTo(b) * 0.32)
        const curve = new THREE.QuadraticBezierCurve3(a, mid, b)
        const wire = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 }),
        )
        scene.add(wire)
        const pulse = new THREE.Mesh(
          pulseGeo,
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
        )
        pulse.visible = !reducedMotion
        scene.add(pulse)
        pulses.push({ curve, mesh: pulse, t: Math.random(), speed: 0.09 + Math.random() * 0.05 })
      }
    }

    // hover + click
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let hovered: THREE.Object3D | null = null
    let downAt: [number, number] | null = null

    const pick = (e: PointerEvent): THREE.Object3D | null => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(pickables, false)
      return hits[0]?.object ?? null
    }

    const onMove = (e: PointerEvent) => {
      const hit = pick(e)
      hovered = hit
      const rect = mount.getBoundingClientRect()
      if (hit) {
        const meta = hit.userData as Meta
        renderer.domElement.style.cursor = meta.kind === 'node' ? 'pointer' : 'default'
        if (meta.kind === 'node') {
          const o = meta.opp
          const total = totalScore(o.scores)
          setTip({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            title: o.name,
            sub: `${SECTOR_LABEL[o.sector]} · ${o.borough} · ${total}/30 ${scoreBand(total)} — click to open`,
          })
        } else if (meta.count > 0) {
          setTip({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            title: meta.name,
            sub: `${meta.count} ${meta.count === 1 ? 'opportunity' : 'opportunities'}`,
          })
        } else {
          setTip(null)
        }
      } else {
        renderer.domElement.style.cursor = 'grab'
        setTip(null)
      }
    }
    const onDown = (e: PointerEvent) => {
      downAt = [e.clientX, e.clientY]
      controls.autoRotate = false
    }
    const onUp = (e: PointerEvent) => {
      if (!downAt) return
      const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1])
      downAt = null
      if (moved > 5) return
      const hit = pick(e)
      const meta = hit?.userData as Meta | undefined
      if (meta?.kind === 'node') onOpenRef.current(meta.opp.id)
    }
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    // size + loop
    const resize = () => {
      const w = mount.clientWidth
      const h = mount.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(mount)

    const clock = new THREE.Clock()
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const dt = clock.getDelta()
      if (!reducedMotion) {
        for (const p of pulses) {
          p.t = (p.t + dt * p.speed) % 1
          p.curve.getPoint(p.t, p.mesh.position)
        }
      }
      const scale = hovered && (hovered.userData as Meta).kind === 'node' ? 1.5 : 1
      for (const obj of pickables) {
        if ((obj.userData as Meta).kind === 'node') {
          const target = obj === hovered ? scale : 1
          obj.scale.lerp(new THREE.Vector3(target, target, target), 0.2)
        }
      }
      controls.update()
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      controls.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [opportunities])

  return (
    <div>
      <Card>
        <SectionTitle aside="Drag to orbit · scroll to zoom · click a data point to open its lead card">
          Signal grid — London opportunities in 3D
        </SectionTitle>
        <div ref={mountRef} style={{ position: 'relative', height: 620, borderRadius: 6, overflow: 'hidden' }}>
          {tip && (
            <div
              style={{
                position: 'absolute',
                left: tip.x + 14,
                top: tip.y + 12,
                zIndex: 5,
                pointerEvents: 'none',
                background: 'var(--rp-card)',
                border: '1px solid var(--rp-hairline-strong)',
                borderRadius: 6,
                padding: '7px 10px',
                maxWidth: 260,
                boxShadow: '0 8px 24px rgba(21,21,19,0.12)',
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{tip.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--rp-ink-2)' }}>{tip.sub}</div>
            </div>
          )}
        </div>
        <div className="rp-maplegend">
          <span>
            <i style={{ background: '#2a78d6', borderColor: 'transparent', borderRadius: '50%' }} />
            Office retrofit
          </span>
          <span>
            <i style={{ background: '#1baf7a', borderColor: 'transparent', borderRadius: '50%' }} />
            PBSA / living
          </span>
          <span>Block height = opportunities in borough · wires link same-sector leads · floating node = pan-London framework</span>
          <span style={{ marginLeft: 'auto' }}>Schematic borough grid — not to geography</span>
        </div>
      </Card>
    </div>
  )
}
