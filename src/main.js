"use strict";

import {registerSettings, settingsKey} from "./settings.js"
import {getSecondaryFormula, getSecondaryName, preparePcData} from "./systems.js"
import {getPcs} from "./util.js";

const renderTemplateAsync = async (...args) => {
	return foundry.applications?.handlebars?.renderTemplate?.(...args) ?? renderTemplate(...args)
}

const DialogV2 = foundry.applications?.api?.DialogV2 ?? Dialog;

function createAwardDialog(config, options = {}) {
	if (typeof DialogV2 !== "function") {
		return new Dialog(config, options)
	}
	try {
		return new DialogV2(config, options)
	} catch (error) {
		console.warn("award-xp | DialogV2 constructor failed with (config, options), retrying with merged config:", error)
	}
	try {
		return new DialogV2({...config, ...options})
	} catch (error) {
		console.warn("award-xp | DialogV2 constructor failed with merged config, falling back to legacy Dialog:", error)
		return new Dialog(config, options)
	}
}

Hooks.once("init", async () => {
	await registerSettings()
	registerKeybindings();
})

Hooks.on("renderActorDirectory", (actorDirectory, html) => {
	addAwardXpButtonToActorDirectory(actorDirectory, html)
})
Hooks.on("renderSidebarTab", (app, html) => {
	if (app?.constructor?.name === "ActorDirectory") {
		addAwardXpButtonToActorDirectory(app, html)
	}
})

function getElementRoot(html) {
	if (!html) return null
	if (html.jquery) return html[0]
	if (html instanceof HTMLElement) return html
	if (html?.element instanceof HTMLElement) return html.element
	if (Array.isArray(html) && html[0] instanceof HTMLElement) return html[0]
	return null
}

function addAwardXpButtonToActorDirectory(actorDirectory, html) {
	if (!game.user.isGM) return
	const root = getElementRoot(html) || getElementRoot(actorDirectory?.element)
	if (!root) return
	if (root.querySelector(".award-xp-open-dialog")) return

	const awardButton = document.createElement("button")
	awardButton.type = "button"
	awardButton.className = "award-xp-open-dialog"
	awardButton.innerHTML = `<i class="fas fa-angle-double-up"></i>${game.i18n.localize("award-xp.award-xp")}`

	const container = root.querySelector(".directory-footer, .sidebar-footer, .app-footer, footer")
	;(container || root).append(awardButton)
	awardButton.addEventListener("click", (event) => {
		event.preventDefault()
		showAwardDialog()
	})
}

function registerKeybindings() {
	game.keybindings.register(settingsKey, "showAwardDialog", {
		name: "award-xp.award-xp",
		onDown: showAwardDialog,
		restricted: true,
		precedence: -1,
	});
}

function filterCharacters(pc) {
	const characterFilter = game.settings.get(settingsKey, "character-filter")
	const isInFilter = characterFilter.includes(pc.id)
	if (game.settings.get(settingsKey, "character-filter-is-blacklist"))
		return !isInFilter
	else
		return isInFilter
}

function getDialogRoot(html) {
	if (!html) return null
	if (html.jquery) return html[0]
	if (Array.isArray(html)) return html[0]
	if (html instanceof HTMLElement) return html
	if (html?.element instanceof HTMLElement) return html.element
	return null
}

async function showAwardDialog() {
	if (!game.user.isGM)
		return
	const secondaryFormula = getSecondaryFormula()
	const secondaryName = secondaryFormula ? getSecondaryName() ?? "[secondary name missing]" : undefined

	const characters = getPcs().filter(filterCharacters)
	const data = {secondaryName, characters, showSoloXp: game.settings.get(settingsKey, "character-solo-xp-input")}
	const content = await renderTemplateAsync("modules/award-xp/templates/award_experience_dialog.html", data)

	const dialogConfig = {
		title: game.i18n.localize("award-xp.award-xp"),
		content,
		buttons: {
			award: {
				label: game.i18n.localize("award-xp.award-xp"),
				callback: awardXP,
			},
			cancel: {
				label: game.i18n.localize("award-xp.cancel") || "Cancel",
				callback: () => {},
			},
		},
		default: "award",
		render: onAwardDialogRendered,
		rejectClose: false,
	}
	const dialogOptions = {
		width: game.settings.get(settingsKey, "character-solo-xp-input") ? 300 : 250,
	}

	const dialog = createAwardDialog(dialogConfig, dialogOptions)
	dialog.render(true)
}

function onAwardDialogRendered(html) {
	const dialog = getDialogRoot(html)
	dialog?.querySelector("#award-xp-secondary-xp")?.addEventListener("keyup", onSecondaryChange)
}

function awardXP(html) {
	const dialog = getDialogRoot(html)
	if (!dialog) return

	let charIds = Array.from(dialog.querySelectorAll(".award-xp-char-selector")).filter(selector => selector.checked).map(selector => selector.name)
	if (charIds.length === 0) {
		throw game.i18n.localize("award-xp.no-char-selected")
	}
	const pcs = preparePcData(game.actors.filter(actor => charIds.includes(actor.id)))
	const groupXp = parseInt(dialog.querySelector("#award-xp-xp")?.value)
	if (isNaN(groupXp)) {
		throw game.i18n.localize("award-xp.xp-nan")
	}

	const divideXp = game.settings.get(settingsKey, "divide-xp")
	const charXp = divideXp ? Math.floor(groupXp / pcs.length) : groupXp
	const soloXpInputs = Array.from(dialog.querySelectorAll(".award-xp-solo"))
	let soloXpPerCharacter = {}
	pcs.forEach(pc => {
		soloXpPerCharacter[pc.actor.id] = 0
		if (game.settings.get(settingsKey, "character-solo-xp-input")) {
			soloXpPerCharacter[pc.actor.id] = parseInt(soloXpInputs.find(input => input.name === `xp${pc.actor.id}`)?.value) || 0
		}
		pc.newXp = pc.xp + charXp + soloXpPerCharacter[pc.actor.id]
		const updateData = {}
		updateData[pc.xpAttribute] = pc.newXp
		pc.actor.update(updateData)
	})

	renderAwardedMessage(charXp, pcs, soloXpPerCharacter)
}

async function renderAwardedMessage(charXp, pcs, soloXpPerCharacter) {
	let message = {}
	message.content = await renderTemplateAsync("modules/award-xp/templates/awarded_experience_message.html", {xp: charXp, characters: pcs.map(pc => {return {name: pc.actor.name, bonusXp: soloXpPerCharacter[pc.actor.id] > 0 ? soloXpPerCharacter[pc.actor.id] : undefined}})})
	ChatMessage.create(message)

	const levelups = pcs.filter(pc => pc.newXp >= pc.nextLevelXp)
	if (levelups.length > 0) {
		let message = {}
		message.content = await renderTemplateAsync("modules/award-xp/templates/levelup_message.html", {characters: levelups.map(pc => pc.actor.name)})
		ChatMessage.create(message)
	}
}

function onSecondaryChange(event) {
	const secondaryValue = event.target.value.trim()
	const formula = getSecondaryFormula()
	const entry = formula.find(entry => secondaryValue == entry[0])
	if (entry) {
		const xp = entry[1]
		document.querySelector("#award-xp-xp").value = xp
	}
}
