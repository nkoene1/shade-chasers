import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { RigidBody, TrimeshCollider } from '@react-three/rapier';
import { useMemo } from 'react';
import * as THREE from 'three';

const RUIN_SKYSCRAPER_PATH = '/models/ruin_skyscraper.glb';
const RUIN_BUILDING_PATH = '/models/ruin_building.glb';
const RUIN_WALL_PATH = '/models/ruin_wall_1.glb';

const ANTENNA_PATH = '/models/antenna.glb';
const DEAD_TREE_PATH = '/models/dead-tree.glb';
const STONE_SLAB_PATH = '/models/stone-slab.glb';
const WOOD_PATH = '/models/wood.glb';

const MILITARY_BARREL_GREY_PATH = '/models/military/barrel_grey.glb';
const MILITARY_BOX_BIG_1_PATH = '/models/military/box_big_1.glb';
const MILITARY_BOX_BIG_2_PATH = '/models/military/box_big_2.glb';
const MILITARY_BOX_BIG_3_PATH = '/models/military/box_big_3.glb';
const MILITARY_BOX_BIG_4_PATH = '/models/military/box_big_4.glb';
const MILITARY_BOX_SMALL_DARK_PATH = '/models/military/box_small_dark.glb';
const MILITARY_BOX_SMALL_LIGHT_PATH = '/models/military/box_small_light.glb';
const MILITARY_BOX_WITH_TARP_PATH = '/models/military/box_with_tarp.glb';
const MILITARY_CONTAINER_PATH = '/models/military/container.glb';
const MILITARY_HEDGEHOG_PATH = '/models/military/hedgehog.glb';
const MILITARY_RADIOSTATION_PATH = '/models/military/radiostation.glb';
const MILITARY_TABLE_PATH = '/models/military/table.glb';
const MILITARY_TARGET_PATH = '/models/military/target.glb';
const MILITARY_TENT_PATH = '/models/military/tent.glb';
const MILITARY_TOWER_PATH = '/models/military/tower.glb';

function mulberry32(seed: number) {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function createConcreteMaterial(): THREE.MeshStandardMaterial {
	return new THREE.MeshStandardMaterial({
		color: new THREE.Color(0.78, 0.74, 0.68),
		roughness: 0.95,
		metalness: 0,
		flatShading: true,
	});
}

function bakeWeatheringColors(geo: THREE.BufferGeometry, seed: number) {
	const rand = mulberry32(seed);
	const pos = geo.attributes.position;
	const count = pos.count;
	const colors = new Float32Array(count * 3);

	const base = new THREE.Color(0.78, 0.74, 0.68);
	const stain = new THREE.Color(0.55, 0.51, 0.45);
	const bleach = new THREE.Color(0.9, 0.87, 0.82);

	for (let i = 0; i < count; i++) {
		const y = pos.getY(i);
		const heightFade = Math.min(1, Math.max(0, y * 0.15));

		const r = rand();
		let col: THREE.Color;
		if (r < 0.25) {
			col = base.clone().lerp(stain, 0.3 + rand() * 0.5);
		} else if (r < 0.4) {
			col = base.clone().lerp(bleach, 0.2 + rand() * 0.4);
		} else {
			col = base.clone();
			const drift = (rand() - 0.5) * 0.12;
			col.r += drift;
			col.g += drift * 0.9;
			col.b += drift * 0.7;
		}

		col.lerp(bleach, heightFade * 0.3);

		colors[i * 3] = Math.max(0, Math.min(1, col.r));
		colors[i * 3 + 1] = Math.max(0, Math.min(1, col.g));
		colors[i * 3 + 2] = Math.max(0, Math.min(1, col.b));
	}

	geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function tuneTextureFiltering(texture: THREE.Texture | null | undefined, anisotropy: number) {
	if (!texture) return;
	texture.generateMipmaps = true;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.anisotropy = anisotropy;
	texture.needsUpdate = true;
}

function tuneModelMaterial(
	material: THREE.Material | THREE.Material[],
	anisotropy: number
): THREE.Material | THREE.Material[] {
	if (Array.isArray(material)) {
		return material.map((mat) => tuneModelMaterial(mat, anisotropy) as THREE.Material);
	}

	const mat = material.clone();
	mat.visible = true;
	mat.side = THREE.DoubleSide;

	if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
		tuneTextureFiltering(mat.map, anisotropy);
		tuneTextureFiltering(mat.emissiveMap, anisotropy);
		tuneTextureFiltering(mat.normalMap, anisotropy);

		if (mat.normalMap) {
			mat.normalScale.set(0.2, 0.2);
		}
		mat.bumpMap = null;
		mat.displacementMap = null;
		mat.roughnessMap = null;
		mat.metalnessMap = null;
		mat.aoMap = null;
		mat.roughness = Math.max(mat.roughness, 0.82);
		mat.metalness = 0;
		mat.needsUpdate = true;
	}

	return mat;
}

interface ObstaclePlacement {
	position: [number, number, number];
	rotationX?: number;
	rotationY?: number;
	rotationZ?: number;
	scale?: number;
}

function computeSceneBoundsCenter(scene: THREE.Group): THREE.Vector3 {
	const box = new THREE.Box3();
	scene.updateMatrixWorld(true);
	scene.traverse((child) => {
		if (child instanceof THREE.Mesh && child.geometry) {
			const geo = child.geometry.clone();
			geo.applyMatrix4(child.matrixWorld);
			box.expandByObject(Object.assign(new THREE.Mesh(geo), { geometry: geo }));
			geo.dispose();
		}
	});
	const center = new THREE.Vector3();
	box.getCenter(center);
	center.y = box.min.y;
	return center;
}

function extractTrimeshData(
	scene: THREE.Group,
	center: THREE.Vector3,
	scale: number,
	rotationX: number,
	rotationY: number,
	rotationZ: number
) {
	const centerOffset = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);
	const rotation = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotationX, rotationY, rotationZ));
	const scaleM = new THREE.Matrix4().makeScale(scale, scale, scale);
	const transform = new THREE.Matrix4().multiply(scaleM).multiply(rotation).multiply(centerOffset);

	const geometries: THREE.BufferGeometry[] = [];
	scene.updateMatrixWorld(true);
	scene.traverse((child) => {
		if (child instanceof THREE.Mesh && child.geometry) {
			const geo = child.geometry.clone();
			geo.applyMatrix4(child.matrixWorld);
			geo.applyMatrix4(transform);
			geometries.push(geo);
		}
	});

	let totalVerts = 0;
	let totalIndices = 0;
	for (const geo of geometries) {
		totalVerts += geo.attributes.position.count;
		totalIndices += geo.index ? geo.index.count : geo.attributes.position.count;
	}

	const vertices = new Float32Array(totalVerts * 3);
	const indices = new Uint32Array(totalIndices);
	let vertOffset = 0;
	let idxOffset = 0;
	let vertCount = 0;

	for (const geo of geometries) {
		const pos = geo.attributes.position;
		for (let i = 0; i < pos.count; i++) {
			vertices[(vertOffset + i) * 3] = pos.getX(i);
			vertices[(vertOffset + i) * 3 + 1] = pos.getY(i);
			vertices[(vertOffset + i) * 3 + 2] = pos.getZ(i);
		}
		if (geo.index) {
			for (let i = 0; i < geo.index.count; i++) {
				indices[idxOffset + i] = geo.index.array[i] + vertCount;
			}
			idxOffset += geo.index.count;
		} else {
			for (let i = 0; i < pos.count; i++) {
				indices[idxOffset + i] = vertCount + i;
			}
			idxOffset += pos.count;
		}
		vertCount += pos.count;
		vertOffset += pos.count;
		geo.dispose();
	}

	return { vertices, indices };
}

interface RuinObstacleProps {
	path: string;
	placement: ObstaclePlacement;
}

interface ModelObstacleProps {
	path: string;
	placement: ObstaclePlacement;
	useConcreteWeathering?: boolean;
}

function ModelObstacle({ path, placement, useConcreteWeathering = false }: ModelObstacleProps) {
	const { scene } = useGLTF(path);
	const { gl } = useThree();
	const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
	const scale = placement.scale ?? 1;
	const rotationX = placement.rotationX ?? 0;
	const rotationY = placement.rotationY ?? 0;
	const rotationZ = placement.rotationZ ?? 0;

	const center = useMemo(() => computeSceneBoundsCenter(scene), [scene]);

	const clonedScene = useMemo(() => {
		const clone = scene.clone(true);
		let meshIdx = 0;
		clone.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				if (useConcreteWeathering) {
					const nonIndexed = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
					nonIndexed.computeVertexNormals();
					bakeWeatheringColors(nonIndexed, meshIdx * 1337 + 7);
					child.geometry = nonIndexed;

					const mat = createConcreteMaterial();
					mat.vertexColors = true;
					child.material = mat;
				} else {
					child.geometry = child.geometry.clone();
					child.material = tuneModelMaterial(child.material, maxAnisotropy);
				}

				child.visible = true;
				child.frustumCulled = false;
				child.castShadow = true;
				child.receiveShadow = true;
				meshIdx++;
			}
		});
		return clone;
	}, [scene, useConcreteWeathering, maxAnisotropy]);

	const trimesh = useMemo(
		() => extractTrimeshData(scene, center, scale, rotationX, rotationY, rotationZ),
		[scene, center, scale, rotationX, rotationY, rotationZ]
	);

	return (
		<RigidBody type="fixed" position={placement.position} colliders={false}>
			<group rotation={[rotationX, rotationY, rotationZ]} scale={scale}>
				<primitive object={clonedScene} position={[-center.x, -center.y, -center.z]} />
			</group>
			<TrimeshCollider args={[trimesh.vertices, trimesh.indices]} />
		</RigidBody>
	);
}

function RuinObstacle(props: RuinObstacleProps) {
	return <ModelObstacle {...props} useConcreteWeathering />;
}

// ---------------------------------------------------------------------------
// Placement data — edit these arrays to add/move/remove instances
// ---------------------------------------------------------------------------

const RUIN_SKYSCRAPER: ObstaclePlacement[] = [
	{ position: [-60, 0, -40], rotationX: 0.1, rotationY: 1, rotationZ: 0, scale: 0.5 },
	{ position: [-35, -14, 11], rotationX: 0, rotationY: 0, rotationZ: 0, scale: 0.5 },
	{ position: [-70, -10, -9], rotationX: 0, rotationY: 2, rotationZ: 0, scale: 0.5 },
	{ position: [-90, -2, -6], rotationX: 0.1, rotationY: 1, rotationZ: 0, scale: 0.5 },
	{ position: [-60, -20, -10], rotationX: 0.2, rotationY: 3, rotationZ: 0, scale: 0.5 },
	{ position: [-58, -12, 20], rotationX: 0, rotationY: 0, rotationZ: 0, scale: 0.5 },
	{ position: [-30, 0, -40], rotationX: 1.5, rotationY: 0.1, rotationZ: 1, scale: 0.5 },
];

const RUIN_BUILDING: ObstaclePlacement[] = [
	{ position: [-6, 1.1, -12], rotationX: 0, rotationY: 0, rotationZ: 0, scale: 0.5 },
];

const RUIN_WALLS: ObstaclePlacement[] = [
	{ position: [10, 0.5, 16], rotationX: 0, rotationY: 0.8, rotationZ: 0, scale: 0.5 },
	{ position: [-16, 1, 20], rotationX: 0, rotationY: 3, rotationZ: 0, scale: 0.5 },
];

const ANTENNA: ObstaclePlacement[] = [
	{ position: [52, 0, -50], rotationX: 0, rotationY: 0, rotationZ: -0.05, scale: 0.25 },
];
const DEAD_TREE: ObstaclePlacement[] = [
	{ position: [24, -1, -14], rotationX: 0.1, rotationY: 0, rotationZ: 0, scale: 0.5 },
	{ position: [32, 1, -22], rotationX: 0, rotationY: 0, rotationZ: 0, scale: 0.5 },
	{ position: [26, 1, -26], rotationX: 0, rotationY: 1.5, rotationZ: 0, scale: 0.5 },
];

const STONE_SLAB: ObstaclePlacement[] = [];

const WOOD: ObstaclePlacement[] = [
	{ position: [28, 1, -20], rotationX: 0, rotationY: 0, rotationZ: 0, scale: 0.5 },
	{ position: [28, 1, -16], rotationX: 0, rotationY: 0, rotationZ: 0, scale: 0.5 },
];

const MILITARY_BARREL_GREY: ObstaclePlacement[] = [
	{ position: [10.5, 0.5, 11.8], rotationX: 0.2, rotationY: 0, rotationZ: 0.2, scale: 1 },
	{ position: [32.6, 4.8, 2.5], rotationX: 0, rotationY: 1.5, rotationZ: 0, scale: 1 },
	{ position: [33.3, 4.8, 2.5], rotationX: 0, rotationY: 0, rotationZ: 0, scale: 1 },
	{ position: [33, 4.8, 3], rotationX: 0, rotationY: 1, rotationZ: 0, scale: 1 },
	{ position: [32.6, 5.9, 2.5], rotationX: 1.5, rotationY: 0, rotationZ: 4.5, scale: 1 },
];

const MILITARY_BOX_BIG_1: ObstaclePlacement[] = [];
const MILITARY_BOX_BIG_2: ObstaclePlacement[] = [];
const MILITARY_BOX_BIG_3: ObstaclePlacement[] = [];
const MILITARY_BOX_BIG_4: ObstaclePlacement[] = [];
const MILITARY_BOX_SMALL_DARK: ObstaclePlacement[] = [];
const MILITARY_BOX_SMALL_LIGHT: ObstaclePlacement[] = [];

const MILITARY_BOX_WITH_TARP: ObstaclePlacement[] = [
	{ position: [20, 1, 5], rotationX: 0.2, rotationY: 0, rotationZ: 0.2, scale: 1 },
	{ position: [15, 1, -5], rotationX: 0, rotationY: 1.5, rotationZ: 0, scale: 1 },
];

const MILITARY_CONTAINER: ObstaclePlacement[] = [
	{ position: [-34, 2.2, -11.5], rotationX: -0.1, rotationY: -1, rotationZ: 0, scale: 1 },
];

const MILITARY_HEDGEHOG: ObstaclePlacement[] = [
	{ position: [-28, 1, -1.2], rotationX: 0, rotationY: 0.75, rotationZ: 0, scale: 1.5 },
	{ position: [-30, 0.8, 0], rotationX: 0, rotationY: -0.25, rotationZ: 0, scale: 1.5 },
];

const MILITARY_RADIOSTATION: ObstaclePlacement[] = [
	{ position: [-28, 0.8, -10], rotationX: 0, rotationY: 1.5, rotationZ: 0, scale: 1 },
];

const MILITARY_TABLE: ObstaclePlacement[] = [];

const MILITARY_TARGET: ObstaclePlacement[] = [];

const MILITARY_TENT: ObstaclePlacement[] = [
	{ position: [1.5, 1.9, -45], rotationX: 0, rotationY: 0, rotationZ: 0, scale: 1.1 },
];

const MILITARY_TOWER: ObstaclePlacement[] = [
	{ position: [30, 2, 0], rotationX: 0, rotationY: 1.5, rotationZ: 0, scale: 1 },
	{ position: [25, -3, -33], rotationX: -0.05, rotationY: 1.5, rotationZ: 0, scale: 0.95 },
];

interface ObstacleType {
	key: string;
	path: string;
	placements: ObstaclePlacement[];
}

const MODEL_OBSTACLES: ObstacleType[] = [
	{ key: 'antenna', path: ANTENNA_PATH, placements: ANTENNA },
	{ key: 'dead-tree', path: DEAD_TREE_PATH, placements: DEAD_TREE },
	{ key: 'stone-slab', path: STONE_SLAB_PATH, placements: STONE_SLAB },
	{ key: 'wood', path: WOOD_PATH, placements: WOOD },
];

const MILITARY_OBSTACLES: ObstacleType[] = [
	{ key: 'military-barrel-grey', path: MILITARY_BARREL_GREY_PATH, placements: MILITARY_BARREL_GREY },
	{ key: 'military-box-big-1', path: MILITARY_BOX_BIG_1_PATH, placements: MILITARY_BOX_BIG_1 },
	{ key: 'military-box-big-2', path: MILITARY_BOX_BIG_2_PATH, placements: MILITARY_BOX_BIG_2 },
	{ key: 'military-box-big-3', path: MILITARY_BOX_BIG_3_PATH, placements: MILITARY_BOX_BIG_3 },
	{ key: 'military-box-big-4', path: MILITARY_BOX_BIG_4_PATH, placements: MILITARY_BOX_BIG_4 },
	{ key: 'military-box-small-dark', path: MILITARY_BOX_SMALL_DARK_PATH, placements: MILITARY_BOX_SMALL_DARK },
	{ key: 'military-box-small-light', path: MILITARY_BOX_SMALL_LIGHT_PATH, placements: MILITARY_BOX_SMALL_LIGHT },
	{ key: 'military-box-with-tarp', path: MILITARY_BOX_WITH_TARP_PATH, placements: MILITARY_BOX_WITH_TARP },
	{ key: 'military-container', path: MILITARY_CONTAINER_PATH, placements: MILITARY_CONTAINER },
	{ key: 'military-hedgehog', path: MILITARY_HEDGEHOG_PATH, placements: MILITARY_HEDGEHOG },
	{ key: 'military-radiostation', path: MILITARY_RADIOSTATION_PATH, placements: MILITARY_RADIOSTATION },
	{ key: 'military-table', path: MILITARY_TABLE_PATH, placements: MILITARY_TABLE },
	{ key: 'military-target', path: MILITARY_TARGET_PATH, placements: MILITARY_TARGET },
	{ key: 'military-tent', path: MILITARY_TENT_PATH, placements: MILITARY_TENT },
	{ key: 'military-tower', path: MILITARY_TOWER_PATH, placements: MILITARY_TOWER },
];

export function Obstacles() {
	return (
		<>
			{RUIN_SKYSCRAPER.map((placement, i) => (
				<RuinObstacle key={`skyscraper-${i}`} path={RUIN_SKYSCRAPER_PATH} placement={placement} />
			))}
			{RUIN_BUILDING.map((placement, i) => (
				<RuinObstacle key={`building-${i}`} path={RUIN_BUILDING_PATH} placement={placement} />
			))}
			{RUIN_WALLS.map((placement, i) => (
				<RuinObstacle key={`wall-${i}`} path={RUIN_WALL_PATH} placement={placement} />
			))}
			{MODEL_OBSTACLES.map(({ key, path, placements }) =>
				placements.map((placement, i) => <ModelObstacle key={`${key}-${i}`} path={path} placement={placement} />)
			)}
			{MILITARY_OBSTACLES.map(({ key, path, placements }) =>
				placements.map((placement, i) => <ModelObstacle key={`${key}-${i}`} path={path} placement={placement} />)
			)}
		</>
	);
}

useGLTF.preload(RUIN_SKYSCRAPER_PATH);
useGLTF.preload(RUIN_BUILDING_PATH);
useGLTF.preload(RUIN_WALL_PATH);
useGLTF.preload(ANTENNA_PATH);
useGLTF.preload(DEAD_TREE_PATH);
useGLTF.preload(STONE_SLAB_PATH);
useGLTF.preload(WOOD_PATH);
useGLTF.preload(MILITARY_BARREL_GREY_PATH);
useGLTF.preload(MILITARY_BOX_BIG_1_PATH);
useGLTF.preload(MILITARY_BOX_BIG_2_PATH);
useGLTF.preload(MILITARY_BOX_BIG_3_PATH);
useGLTF.preload(MILITARY_BOX_BIG_4_PATH);
useGLTF.preload(MILITARY_BOX_SMALL_DARK_PATH);
useGLTF.preload(MILITARY_BOX_SMALL_LIGHT_PATH);
useGLTF.preload(MILITARY_BOX_WITH_TARP_PATH);
useGLTF.preload(MILITARY_CONTAINER_PATH);
useGLTF.preload(MILITARY_HEDGEHOG_PATH);
useGLTF.preload(MILITARY_RADIOSTATION_PATH);
useGLTF.preload(MILITARY_TABLE_PATH);
useGLTF.preload(MILITARY_TARGET_PATH);
useGLTF.preload(MILITARY_TENT_PATH);
useGLTF.preload(MILITARY_TOWER_PATH);
