import {getDivideXpDefault} from "./systems.js";
import {getPcs} from "./util.js"

const mergeObject = foundry.utils.mergeObject;
const api = foundry.applications.api || {}
const BaseApplication = api.ApplicationV2 ?? Application;
const BaseFormApplication = api.FormApplicationV2 ?? FormApplication;

export const settingsKey = "award-xp";

export function registerSettings() {
	game.settings.registerMenu(settingsKey, "character-filter-menu", {
		name: "award-xp.settings.filter-character.name",
		hint: "award-xp.settings.filter-character.hint",
		label: "award-xp.settings.filter-character.button",
		icon: "fas fa-filter",
		type: CharacterFilterApplication,
		restricted: true,
	})
	game.settings.register(settingsKey, "character-solo-xp-input", {
		name: "award-xp.settings.solo-xp.name",
		hint: "award-xp.settings.solo-xp.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
	})
	game.settings.register(settingsKey, "character-filter", {
		scope: "world",
		config: false,
		type: Array,
		default: [],
	})
	game.settings.register(settingsKey, "character-filter-is-blacklist", {
		scope: "world",
		config: false,
		type: Boolean,
		default: true,
	})
	game.settings.register(settingsKey, "divide-xp", {
		name: "award-xp.settings.divide-xp.name",
		hint: "award-xp.settings.divide-xp.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: getDivideXpDefault(),
	})
	await registerSettingsAsync()
}

async function registerSettingsAsync() {
	try {
		const rowTemplate = await getTemplate("modules/award-xp/templates/edit_character_filter_dialog_table_row.html")
		Handlebars.registerPartial("awardXpRowTemplate", rowTemplate)
	} catch (error) {
		console.error("award-xp | Failed to register settings partial:", error)
	}
}

function getRootElement(element) {
	return element?.[0] ?? element
}

class CharacterFilterApplication extends BaseFormApplication {
	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			id: "award-xp-edit-character-filter",
			title: game.i18n.localize("award-xp.settings.filter-character.name"),
			template: "modules/award-xp/templates/edit_character_filter_dialog.html",
			classes: ["application", "award-xp-filter"],
		})
	}

	activateListeners(root) {
		super.activateListeners?.(root)
		const element = getRootElement(root ?? this.element)
		if (!element) return

		element.querySelectorAll("input[name=isBlacklist]").forEach(input => {
			input.addEventListener("change", this.onListTypeChanged.bind(this))
		})

		const addButton = element.querySelector("#award-xp-filter-add-character")
		if (addButton) {
			addButton.addEventListener("click", (event) => {
				event.preventDefault()
				CharacterPickerApplication.open(this)
			})
		}

		element.querySelectorAll(".award-xp-remove-character").forEach(button => {
			button.addEventListener("click", this.onCharacterRemoveClicked.bind(this))
		})

		const isBlacklist = game.settings.get(settingsKey, "character-filter-is-blacklist")
		const selectedInput = element.querySelector(`input[name=isBlacklist][value=${isBlacklist}]`)
		if (selectedInput) selectedInput.checked = true
	}

	onListTypeChanged(event) {
		const value = event.target?.value
		game.settings.set(settingsKey, "character-filter-is-blacklist", value === "true")
	}

	getData(options = {}) {
		const characterFilter = game.settings.get(settingsKey, "character-filter")
		return {
			characters: getPcs().filter(pc => characterFilter.includes(pc.id))
		}
	}

	async addCharacter(id) {
		const characterFilter = game.settings.get(settingsKey, "character-filter")
		characterFilter.push(id)
		await game.settings.set(settingsKey, "character-filter", characterFilter)
		this.rerender()
	}

	async onCharacterRemoveClicked(event) {
		const id = event.currentTarget.dataset.actor ?? event.currentTarget.dataset.id
		const characterFilter = game.settings.get(settingsKey, "character-filter")
		const index = characterFilter.indexOf(id)
		if (index !== -1) {
			characterFilter.splice(index, 1)
			await game.settings.set(settingsKey, "character-filter", characterFilter)
			this.rerender()
		}
	}

	async rerender() {
		const element = getRootElement(this.element)
		if (element) {
			element.style.width = null
			element.style.height = null
		}
		this.position.width = undefined
		this.position.height = undefined
		return this.render(false)
	}
}

class CharacterPickerApplication extends BaseApplication {
	constructor(options = {}) {
		super(options)
		this.parent = options.parent
	}

	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			id: "award-xp-character-picker",
			title: game.i18n.localize("award-xp.char-picker"),
			template: "modules/award-xp/templates/character_picker_dialog.html",
			classes: ["application", "award-xp-picker"],
		})
	}

	static open(parent) {
		new CharacterPickerApplication({parent}).render(true)
	}

	getData(options = {}) {
		const characterFilter = game.settings.get(settingsKey, "character-filter")
		return {characters: getPcs().filter(pc => !characterFilter.includes(pc.id))}
	}

	activateListeners(root) {
		super.activateListeners?.(root)
		const element = getRootElement(root ?? this.element)
		if (!element) return
		element.querySelectorAll(".award-xp-char").forEach(item => {
			item.addEventListener("click", this.onCharacterClicked.bind(this))
		})
	}

	onCharacterClicked(event) {
		this.parent.addCharacter(event.currentTarget.dataset.id)
		this.close()
	}
}
