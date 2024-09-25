export function getPcs() {
	return game.actors.filter(actor => actor.system.type === "character" || actor.system.type === "player").map(actor =>{return {id: actor.id, name: actor.system.name, image: actor.system.img}});	
}
