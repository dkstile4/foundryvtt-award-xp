export function getPcs() {
	return game.actors.filter(actor => actor.type === "character" || actor.type === "player").map(actor =>{return {id: actor.id, name: actor.name, image: actor.img}});	
}
