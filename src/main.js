"use strict";

import {registerSettings, settingsKey} from "./settings.js"
import {getSecondaryFormula, getSecondaryName, preparePcData} from "./systems.js"
import {getPcs} from "./util.js";


Hooks.once("init", () => {
	registerSettings()
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

function addAwardXpButtonToActorDirectory(actorDirectory, html) {
	if (!game.user.isGM) return
	if (html.find(".award-xp-open-dialog").length) return

	const awardButton = $(`<button type="button" class="award-xp-open-dialog"><i class="fas fa-angle-double-up"></i>${game.i18n.localize("award-xp.award-xp")}</button>`)
	const container = html.find(".directory-footer, .sidebar-footer, .app-footer, footer").first()
	(container.length ? container : html).append(awardButton)
	awardButton.on("click", (event) => {
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
	const content = await renderTemplate("modules/award-xp/templates/award_experience_dialog.html", data)

	new DialogV2({
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
		options: {
			width: game.settings.get(settingsKey, "character-solo-xp-input") ? 300 : 250,
		},
	}).render(true)
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
	message.content = await renderTemplate("modules/award-xp/templates/awarded_experience_message.html", {xp: charXp, characters: pcs.map(pc => {return {name: pc.actor.name, bonusXp: soloXpPerCharacter[pc.actor.id] > 0 ? soloXpPerCharacter[pc.actor.id] : undefined}})})
	ChatMessage.create(message)

	const levelups = pcs.filter(pc => pc.newXp >= pc.nextLevelXp)
	if (levelups.length > 0) {
		let message = {}
		message.content = await renderTemplate("modules/award-xp/templates/levelup_message.html", {characters: levelups.map(pc => pc.actor.name)})
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
