import { useGLTF } from "@react-three/drei";
import { RigidBody, TrimeshCollider } from "@react-three/rapier";
import { useMemo } from "react";
import * as THREE from "three";

const RUIN_SKYSCRAPER_PATH = "/models/ruin_skyscraper.glb";
const RUIN_BUILDING_PATH = "/models/ruin_building.glb";
const RUIN_WALL_PATH = "/models/ruin_wall_1.glb";

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
	const bleach = new THREE.Color(0.90, 0.87, 0.82);

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

	geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

interface ObstaclePlacement {
	position: [number, number, number];
	rotationY?: number;
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
	rotationY: number,
) {
	const centerOffset = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);
	const rotation = new THREE.Matrix4().makeRotationY(rotationY);
	const scaleM = new THREE.Matrix4().makeScale(scale, scale, scale);
	const transform = new THREE.Matrix4()
		.multiply(scaleM)
		.multiply(rotation)
		.multiply(centerOffset);

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

function RuinObstacle({ path, placement }: RuinObstacleProps) {
	const { scene } = useGLTF(path);
	const scale = placement.scale ?? 1;
	const rotationY = placement.rotationY ?? 0;

	const center = useMemo(() => computeSceneBoundsCenter(scene), [scene]);

	const clonedScene = useMemo(() => {
		const clone = scene.clone(true);
		let meshIdx = 0;
		clone.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				const nonIndexed = child.geometry.index
					? child.geometry.toNonIndexed()
					: child.geometry.clone();
				nonIndexed.computeVertexNormals();
				bakeWeatheringColors(nonIndexed, meshIdx * 1337 + 7);
				child.geometry = nonIndexed;

				const mat = createConcreteMaterial();
				mat.vertexColors = true;
				child.material = mat;
				child.castShadow = true;
				child.receiveShadow = true;
				meshIdx++;
			}
		});
		return clone;
	}, [scene]);

	const trimesh = useMemo(
		() => extractTrimeshData(scene, center, scale, rotationY),
		[scene, center, scale, rotationY],
	);

	return (
		<RigidBody type="fixed" position={placement.position} colliders={false}>
			<group rotation={[0, rotationY, 0]} scale={scale}>
				<primitive
					object={clonedScene}
					position={[-center.x, -center.y, -center.z]}
				/>
			</group>
			<TrimeshCollider args={[trimesh.vertices, trimesh.indices]} />
		</RigidBody>
	);
}

// ---------------------------------------------------------------------------
// Placement data — edit these arrays to add/move/remove instances
// ---------------------------------------------------------------------------

const RUIN_SKYSCRAPER: ObstaclePlacement[] = [
	{ position: [-60, 0, -30], rotationY: 1, scale: 0.5 },
	{ position: [-16, -8, -7], rotationY: 0, scale: 0.5 },
];

const RUIN_BUILDING: ObstaclePlacement[] = [
	{ position: [0, 2, -28], rotationY: 0, scale: 0.5 },
];

const RUIN_WALLS: ObstaclePlacement[] = [
	{ position: [10, 0.5, 16], rotationY: 0.8, scale: 0.5 },
	{ position: [-16, 1, 20], rotationY: 3, scale: 0.5 },
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
		</>
	);
}

useGLTF.preload(RUIN_SKYSCRAPER_PATH);
useGLTF.preload(RUIN_BUILDING_PATH);
useGLTF.preload(RUIN_WALL_PATH);
