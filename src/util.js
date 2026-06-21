export function getPcs() {
	return game.actors
		.filter(actor => actor.hasPlayerOwner || actor.type === "character" || actor.type === "player")
		.map(actor => ({ id: actor.id, name: actor.name, image: actor.img }))
}
