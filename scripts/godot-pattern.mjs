// Builds public/godot-pattern.svg: a tile of Godot's own node icons (MIT, Godot Engine contributors), flattened to one colour.
// Run by hand when the icon set changes: node scripts/godot-pattern.mjs
import { writeFile } from 'node:fs/promises';

const tag = '4.5-stable';
const names = [
	'Node2D', 'Sprite2D', 'AnimationPlayer', 'CharacterBody2D', 'Camera2D', 'Area2D',
	'CollisionShape2D', 'TileMap', 'AudioStreamPlayer', 'Timer', 'Label', 'Button',
	'GPUParticles2D', 'Path2D', 'RayCast2D', 'PointLight2D', 'NavigationAgent2D', 'Skeleton2D',
	'Node3D', 'MeshInstance3D', 'Camera3D', 'DirectionalLight3D', 'RigidBody2D', 'AnimatedSprite2D',
	'Script', 'PackedScene', 'Signal', 'GDScript', 'CanvasLayer', 'ColorRect',
	'Marker2D', 'Tween', 'HTTPRequest', 'ShaderMaterial', 'Control', 'Node'
];
const cols = 6, cell = 48, scale = 1.5;

const src = (n) => `https://raw.githubusercontent.com/godotengine/godot/${tag}/${n === 'GDScript' ? 'modules/gdscript/icons' : 'editor/icons'}/${n}.svg`;
const body = (svg) => svg.replace(/^[\s\S]*?<svg[^>]*>|<\/svg>\s*$/g, '').replace(/(fill|stroke)="(?!none)[^"]*"/g, '$1="#fff"');

const icons = await Promise.all(names.map(async (n) => {
	const res = await fetch(src(n));
	if (!res.ok) throw new Error(`${n}: ${res.status}`);
	return body(await res.text());
}));
const rows = Math.ceil(icons.length / cols);
// Odd rows shift half a cell so the columns don't line up into stripes.
const cells = icons.map((g, i) => {
	const r = Math.floor(i / cols), c = i % cols;
	const x = ((c * cell + (r % 2) * cell / 2) % (cols * cell)) + (cell - 16 * scale) / 2;
	return `<g transform="translate(${x} ${r * cell + (cell - 16 * scale) / 2}) scale(${scale})">${g}</g>`;
});
await writeFile('public/godot-pattern.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * cell}">${cells.join('')}</svg>\n`);
console.log(`${icons.length} icons, tile ${cols * cell}×${rows * cell}`);
