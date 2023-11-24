import { HeroSystem6eAttackCard } from "../card/attack-card.js";
import { HeroSystem6eCard } from "../card/card.js";
import { HEROSYS } from "../herosystem6e.js";
import * as Dice from "../dice.js"
import * as Attack from "../item/item-attack.js"
import { createSkillPopOutFromItem } from '../item/skill.js'
import { enforceManeuverLimits } from '../item/manuever.js'
import { SkillRollUpdateValue, updateItem } from '../utility/upload_hdc.js'
import { onActiveEffectToggle } from '../utility/effects.js'
import { getPowerInfo, getModifierInfo } from '../utility/util.js'
import { RoundFavorPlayerDown, RoundFavorPlayerUp } from "../utility/round.js"
import { HeroSystem6eActor } from "../actor/actor.js"
import { convertToDcFromItem, convertFromDC } from "../utility/damage.js";

/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class HeroSystem6eItem extends Item {

    static async chatListeners(html) {
        html.on('click', '.roll-damage', this.__onChatCardAction.bind(this));
    }

    // Perform preliminary operations before a Document of this type is created. Pre-creation operations only 
    // occur for the client which requested the operation. Modifications to the pending document before it is 
    // persisted should be performed with this.updateSource().
    async _preCreate(data, options, userId) {

        if (this.type == "martialart") {
            HEROSYS.log(false, this.name)
        }

        await super._preCreate(data, options, userId);

        const icons = {
            "attack": "icons/svg/sword.svg",
            "movement": "icons/svg/pawprint.svg",
            "skill": "icons/svg/hanging-sign.svg",
            "defense": "icons/svg/shield.svg",
            "power": "icons/svg/aura.svg",
            "maneuver": "icons/svg/upgrade.svg",
            "martialart": "icons/svg/downgrade.svg",
        }

        // assign a default image
        if (!data.img || data.img === 'icons/svg/item-bag.svg') {
            if (icons[this.type]) {
                this.updateSource({ img: icons[this.type] });
            }
        }
    }


    /**
     * Augment the basic Item data model with additional dynamic data.
     */

    prepareData() {
        super.prepareData();

        //updateItem(this)


        // Get the Item's data
        // const itemData = this.data;
        // const actorData = this.actor ? this.actor.data : {};
        // const data = itemData.data;

        // if (itemData.type === 'skill') this._prepareSkillData(actorData, itemData);

    }

    // _prepareSkillData(actorData, itemData) {
    //     return

    //     const data = itemData.data;

    //     let roll = 6;

    //     switch (data.state) {
    //         case "trained":
    //             let levels = data.levels;

    //             if (!data.characteristic) {
    //                 roll = undefined;
    //             } else if (data.characteristic != "general") {
    //                 if (actorData) {
    //                     levels += actorData.data.characteristics[data.characteristic].value / 5;
    //                 }
    //             }
    //             else {
    //                 roll = 11 + levels;
    //             }
    //             roll = Math.round(9 + levels);
    //             break;
    //         case "proficient":
    //             roll = 10;
    //             break;
    //         case "familiar":
    //             roll = 8;
    //             break;
    //         case "everyman":
    //             if (data.ps) {
    //                 roll = 11;
    //             } else {
    //                 roll = 8;
    //             }
    //             break;
    //         case "noroll":
    //             roll = undefined;
    //             break;
    //     }

    //     data.roll = Math.round(roll);
    // }

    async _onUpdate(data, options, userId) {
        super._onUpdate(data, options, userId);

        if (this.actor && this.type === 'equipment') {
            this.actor.applyEncumbrancePenalty();
        }

    }

    // Largely used to determine if we can drag to hotbar
    isRollable() {
        switch (this.system?.subType || this.type) {
            case 'attack': return true
            case 'skill': return true
            case 'defense': return true
        }
        return false
    }

    async roll(event) {

        if (!this.actor.canAct(true)) return;

        switch (this.system.subType || this.type) {
            case "attack":
                switch (this.system.XMLID) {
                    case "HKA":
                    case "RKA":
                    case "ENERGYBLAST":
                    case "HANDTOHANDATTACK":
                    case "TELEKINESIS":
                    case "EGOATTACK":
                    case "AID":
                    case "DRAIN":
                    case "AID":
                    case "STRIKE":
                    case "FLASH":
                    case undefined:
                        return await Attack.AttackOptions(this, event)

                    default:
                        if (!this.system.EFFECT || (
                            this.system.EFFECT.toLowerCase().indexOf("block") === 0 &&
                            this.system.EFFECT.toLowerCase().indexOf("dodge") === 0
                        ))
                            ui.notifications.warn(`${this.system.XMLID} roll is not fully supported`)
                        return await Attack.AttackOptions(this)
                }

            case "defense":
                return this.toggle()
            case "skill":
                SkillRollUpdateValue(this)
                if (!await RequiresASkillRollCheck(this)) return;
                return createSkillPopOutFromItem(this, this.actor)
            default: ui.notifications.warn(`${this.name} roll is not supported`)
        }

    }

    async chat() {

        this.updateItemDescription();

        let content = `<div class="item-chat">`

        // Part of a framework (is there a PARENTID?)
        if (this.system.PARENTID) {
            const parent = this.actor.items.find(o => o.system.ID == this.system.PARENTID)
            if (parent) {
                content += `<p><b>${parent.name}</b>`
                if (parent.system.description && parent.system.description != parent.name) {
                    content += ` ${parent.system.description}`
                }
                content += ".</p>"
            }
        }
        content += `<b>${this.name}</b>`
        let _desc = this.system.description

        content += ` ${_desc}`;
        //}

        content += "."

        // Powers have one of four Ranges: Self; No Range; Standard
        // Range; and Line of Sight (LOS).
        const configPowerInfo = getPowerInfo({ item: this })
        switch (configPowerInfo?.range?.toLowerCase()) {
            case "standard":
                let range = this.system.basePointsPlusAdders * 10
                if (this.actor?.system?.is5e) {
                    range = Math.floor(range / 2)
                }
                content += ` Maximum Range ${range}${this.actor?.system?.is5e ? '"' : "m"}.`
                break
            case "los":
                content += ` Line of Sight.`
                break
            case "no range":
                content += ` No Range.`
                break
            default: {
                if (configPowerInfo?.range?.toLowerCase()) {
                    content += ` ${configPowerInfo?.range?.toLowerCase()}`
                }
            }
        }


        if (this.system.end) {
            content += ` Estimated End: ${this.system.end}.`
        }
        if (this.system.realCost && !isNaN(this.system.realCost)) {
            content += ` Total Cost: ${this.system.realCost} CP.`
        }



        content += `</div>`

        const chatData = {
            user: game.user._id,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            type: CONST.CHAT_MESSAGE_TYPES.ChatMessage,
            content: content,
            //speaker: speaker
        }
        ChatMessage.create(chatData)
    }

    async toggle() {
        let item = this;



        if (!item.system.active) {


            if (!this.actor.canAct(true)) return;

            const costEndOnlyToActivate = (item.system.MODIFIER || []).find(o => o.XMLID === "COSTSEND" && o.OPTION === "ACTIVATE");
            if (costEndOnlyToActivate) {
                let end = parseInt(this.system.end);
                let value = parseInt(this.actor.system.characteristics.end.value);
                if (end > value) {
                    ui.notifications.error(`Unable to active ${this.name}.  ${item.actor.name} has ${value} END.  Power requires ${end} END to activate.`);
                    return;
                }

                await item.actor.update({ 'system.characteristics.end.value': value - end });

                const speaker = ChatMessage.getSpeaker({ actor: item.actor })
                speaker["alias"] = item.actor.name
                const chatData = {
                    user: game.user._id,
                    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
                    content: `Spent ${end} END to activate ${item.name}`,
                    whisper: ChatMessage.getWhisperRecipients("GM"),
                    speaker,
                }

                await ChatMessage.create(chatData)
            }

            const success = await RequiresASkillRollCheck(this);
            if (!success) {
                return;
            }
        }


        const attr = 'system.active'
        const newValue = !getProperty(item, attr)
        // await item.update({ [attr]: newValue })

        const firstAE = item.effects.find(o => true) || item.actor.effects.find(o => o.origin === item.uuid)

        switch (this.type) {
            case "defense":
                await item.update({ [attr]: newValue })
                break;

            case "power":
            case "equipment":
                // Is this a defense power?  If so toggle active state
                const configPowerInfo = getPowerInfo({ item: item })
                if ((configPowerInfo && configPowerInfo.powerType.includes("defense")) || item.type === "equipment") {
                    await item.update({ [attr]: newValue })
                }

                if (firstAE) {
                    const newState = !newValue
                    await item.update({ [attr]: newState })
                    let effects = item.effects.filter(o => true).concat(item.actor.effects.filter(o => o.origin === item.uuid))
                    for (const activeEffect of effects) {
                        await onActiveEffectToggle(activeEffect, newState)
                    }
                }
                break;
            case "maneuver":
                await enforceManeuverLimits(this.actor, item.id, item.name)
                //await updateCombatAutoMod(item.actor, item)
                break;

            case "talent": // COMBAT_LUCK
                await item.update({ [attr]: newValue })
                break;
            default: ui.notifications.warn(`${this.name} toggle may be incompmlete`)
        }
    }

    isPerceivable(perceptionSuccess) {
        if (["NAKEDMODIFIER", "LIST"].includes(this.system.XMLID)) {
            return false;
        }
        if (this.system.XMLID === "STR") {
            console.log("STR");
        }

        // Power must be turned on
        if (this.system.active === false)
            return false;

        // FOCUS
        let FOCUS = this.system.MODIFIER?.find(o => o.XMLID === "FOCUS")
        if (FOCUS) {
            if (FOCUS?.OPTION?.startsWith("O")) return true;
            if (FOCUS?.OPTION?.startsWith("I")) return perceptionSuccess;
        }


        let VISIBLE = this.system.MODIFIER?.find(o => o.XMLID === "VISIBLE")
        if (VISIBLE) {
            if (VISIBLE?.OPTION?.endsWith("OBVIOUS")) return true;
            if (VISIBLE?.OPTION?.endsWith("INOBVIOUS")) return perceptionSuccess;
            return true; // 5e?
        }

        // PARENT?
        let PARENT = this.actor.items.find(o => o.system.ID === (this.system.PARENTID || 'null'))
        if (PARENT) {
            let VISIBLE = PARENT.system.MODIFIER?.find(o => o.XMLID === "VISIBLE")
            if (VISIBLE) {
                if (VISIBLE?.OPTION.endsWith("OBVIOUS")) return true;
                if (VISIBLE?.OPTION.endsWith("INOBVIOUS")) return perceptionSuccess;
            }
        }


        const configPowerInfo = getPowerInfo({ item: this })
        if (!configPowerInfo?.perceivability) {
            // if (!["LIST"].includes(this.system.XMLID) && game.settings.get(game.system.id, 'alphaTesting')) {
            //     ui.notifications.warn(`${this.system.XMLID} has undetermined percievability`)
            // }
            return false;
        }

        if (configPowerInfo?.duration.toLowerCase() === "instant") return false;
        if (configPowerInfo.perceivability.toLowerCase() == "imperceptible") return false;
        if (configPowerInfo.perceivability.toLowerCase() == "obvious") return true;
        if (configPowerInfo.perceivability.toLowerCase() == "inobvious") return perceptionSuccess

        if (["INVISIBILITY"].includes(this.system.XMLID)) {
            return false;
        }

        if (game.settings.get(game.system.id, 'alphaTesting')) {
            ui.notifications.warn(`${this.name} has undetermined percievability`)
        }
        return false;
    }



    /**
   * Display the chat card for an Item as a Chat Message
   * @param {object} options          Options which configure the display of the item chat card
   * @param {string} rollMode         The message visibility mode to apply to the created card
   * @param {boolean} createMessage   Whether to automatically create a ChatMessage entity (if true), or only return
   *                                  the prepared message data (if false)
   */

    // async displayCard({ rollMode, createMessage = true } = {}) {
    //     switch (this.data.type) {
    //         case "attack":
    //             const attackCard = await HeroSystem6eAttackCard.createChatDataFromItem(this);
    //             ChatMessage.applyRollMode(attackCard, rollMode || game.settings.get("core", "rollMode"));
    //             return createMessage ? ChatMessage.create(attackCard) : attackCard;
    //     }
    // }

    static ItemXmlTags = ["SKILLS", "PERKS", "TALENTS", "MARTIALARTS", "POWERS", "DISADVANTAGES", "EQUIPMENT"]
    // static,
    //     "STR", "DEX", "CON", "INT", "EGO", "PRE", "COM", "OCV", "DCV", "OMCV", "DMCV", "SPD", "PD", "ED", "REC", "END", "BODY", "STUN"]
    static ItemXmlChildTags = ["ADDER", "MODIFIER", "POWER"]


    findModsByXmlid(xmlid) {
        for (const key of HeroSystem6eItem.ItemXmlChildTags) {
            if (this.system?.[key]) {
                const value = this.system[key].find(o => o.XMLID === xmlid)
                if (value) {
                    return value;
                }
            }
        }


        // TODO: Delete support for old format
        for (const key of ['ADDER', 'MODIFIER', 'POWER']) { //'adders', 'modifiers', 'power', 
            if (this.system?.[key]) {
                const value = this.system[key].find(o => o.XMLID === xmlid)
                if (value) {
                    return value;
                }

                for (const subMod of this.system[key]) {
                    for (const key2 of ['ADDER', 'MODIFIER', 'POWER']) {
                        if (subMod[key2]) {
                            const value = subMod[key2].find(o => o.XMLID === xmlid)
                            if (value) {
                                return value;
                            }
                        }
                    }
                }
            }
        }

        // Powerframework may include this modifier
        if (this.system.PARENTID) {
            const parent = this.actor.items.find(o => o.system.ID == this.system.PARENTID)
            if (parent) {
                return parent.findModsByXmlid(xmlid)
            }
        }

        return null
    }

    _calcBaseCost(child) {
        let newValue = child.baseCost //parseFloat(CONFIG.HERO.ModifierOverride[child.XMLID]?.BASECOST || child.baseCost || 0)

        switch (child.XMLID) {
            case "AOE":
                if (child.OPTION == "RADIUS" && parseInt(child.LEVELS) <= 32) return 1.0
                if (child.OPTION == "RADIUS" && parseInt(child.LEVELS) <= 16) return 0.75
                if (child.OPTION == "RADIUS" && parseInt(child.LEVELS) <= 8) return 0.50
                if (child.OPTION == "RADIUS" && parseInt(child.LEVELS) <= 4) return 0.25

                if (child.OPTION == "CONE" && parseInt(child.LEVELS) <= 64) return 1.0
                if (child.OPTION == "CONE" && parseInt(child.LEVELS) <= 32) return 0.75
                if (child.OPTION == "CONE" && parseInt(child.LEVELS) <= 16) return 0.50
                if (child.OPTION == "CONE" && parseInt(child.LEVELS) <= 8) return 0.25

                if (child.OPTION == "LINE" && parseInt(child.LEVELS) <= 125) return 1.0
                if (child.OPTION == "LINE" && parseInt(child.LEVELS) <= 64) return 0.75
                if (child.OPTION == "LINE" && parseInt(child.LEVELS) <= 32) return 0.50
                if (child.OPTION == "LINE" && parseInt(child.LEVELS) <= 16) return 0.25

                if (child.OPTION == "SURFACE" && parseInt(child.LEVELS) <= 16) return 1.0
                if (child.OPTION == "SURFACE" && parseInt(child.LEVELS) <= 8) return 0.75
                if (child.OPTION == "SURFACE" && parseInt(child.LEVELS) <= 4) return 0.50
                if (child.OPTION == "SURFACE" && parseInt(child.LEVELS) <= 2) return 0.25

                if (child.OPTION == "AREA" && parseInt(child.LEVELS) <= 16) return 1.0
                if (child.OPTION == "AREA" && parseInt(child.LEVELS) <= 8) return 0.75
                if (child.OPTION == "AREA" && parseInt(child.LEVELS) <= 4) return 0.50
                if (child.OPTION == "AREA" && parseInt(child.LEVELS) <= 2) return 0.25
        }

        return newValue
    }

    async _postUpload() {

        let changed = false;

        const configPowerInfo = getPowerInfo({ item: this })

        // LEVELS (use value/max instead of LEVELS so we can AID/DRAIN the base power)
        const newValue = parseInt(this.system.LEVELS || 0)
            this.system.max = newValue
            changed = true
        }
        //this.system.value ??= this.system.max
        if (this.system.value != newValue) {
            this.system.value = newValue
            changed = true
        }

        // ActiveEffects
        // for (const ae of this.effects.filter(o=> !o.disabled)) {
        //     console.log(ae)
        // }

        // CHARGES
        const CHARGES = this.findModsByXmlid("CHARGES")
        if (CHARGES) {
            this.system.charges = {
                value: parseInt(CHARGES.OPTION_ALIAS),
                max: parseInt(CHARGES.OPTION_ALIAS),
                recoverable: (CHARGES.ADDER || []).find(o => o.XMLID == "RECOVERABLE") ? true : false,
                continuing: (CHARGES.ADDER || []).find(o => o.XMLID == "CONTINUING")?.OPTIONID
            }
            this.system.charges.value ??= this.system.charges.max
        }

        // DEFENSES
        if (configPowerInfo && configPowerInfo.powerType?.includes("defense")) {
            const newDefenseValue = 'defense'
            if (this.system.subType != newDefenseValue) {
                this.system.subType = newDefenseValue
                this.system.showToggle = true
                changed = true

                const numCharges = this.system.charges?.value || 0;
                if (numCharges > 0 || this.system.AFFECTS_TOTAL === false || configPowerInfo.duration === "instant") {
                } else {
                    this.system.active ??= true;
                }
            }
        }

        // MOVEMENT
        if (configPowerInfo && configPowerInfo.powerType?.includes("movement")) {
            const movement = 'movement'
            if (this.system.subType != movement) {
                this.system.subType = movement
                this.system.showToggle = true
                changed = true
            }
        }

        // TALENTS
        // if (this.type === "talent" || this.system.XMLID === "COMBAT_LUCK") {
        //     if (this.system.active === undefined) {
        //         this.system.active = true
        //         changed = true
        //     }
        // }

        // SKILLS
        if (configPowerInfo && configPowerInfo.powerType?.includes("skill")) {
            const skill = 'skill'
            if (this.system.subType != skill) {
                this.system.subType = skill
                changed = true
            }
        }

        if (["MENTAL_COMBAT_LEVELS", "PENALTY_SKILL_LEVELS"].includes(this.system.XMLID)) {
            switch (this.system.OPTION) {
                case "SINGLE": this.system.costPerLevel = 1; break;
                case "TIGHT": this.system.costPerLevel = 3; break;
                case "BROAD": this.system.costPerLevel = 6; break;
            }
        }

        if (this.system.XMLID == "COMBAT_LEVELS") {
            if (this?.actor?.system?.is5e) {
                switch (this.system.OPTION) {
                    case "SINGLE": this.system.costPerLevel = 2; break;
                    case "TIGHT": this.system.costPerLevel = 3; break;
                    case "DCV": this.system.costPerLevel = 5; break;
                    case "HTH": this.system.costPerLevel = 5; break;
                    case "RANGED": this.system.costPerLevel = 5; break;
                    case "ALL": this.system.costPerLevel = 8; break;
                }
            } else {
                switch (this.system.OPTION) {
                    case "SINGLE": this.system.costPerLevel = 2; break;
                    case "TIGHT": this.system.costPerLevel = 3; break;
                    case "BROAD": this.system.costPerLevel = 5; break;
                    case "HTH": this.system.costPerLevel = 8; break;
                    case "RANGED": this.system.costPerLevel = 8; break;
                    case "ALL": this.system.costPerLevel = 10; break;
                }
            }


            // Make sure CSL's are defined
            this.system.csl = {}
            for (let c = 0; c < parseInt(this.system.LEVELS); c++) {
                this.system.csl[c] = 'ocv';
            }
        }

        if (this.system.XMLID == "MENTAL_COMBAT_LEVELS") {
            // Make sure CSL's are defined
            this.system.csl = {}
            for (let c = 0; c < parseInt(this.system.LEVELS); c++) {
                this.system.csl[c] = 'omcv';
            }
        }


        if (this.system.XMLID == "SKILL_LEVELS") {
            switch (this.system.OPTION) {
                case "CHARACTERISTIC": this.system.costPerLevel = 2; break;
                case "RELATED": this.system.costPerLevel = 3; break;
                case "GROUP": this.system.costPerLevel = 4; break;
                case "AGILITY": this.system.costPerLevel = 6; break;
                case "NONCOMBAT": this.system.costPerLevel = 10; break;
                case "SINGLEMOVEMENT": this.system.costPerLevel = 2; break;
                case "ALLMOVEMENT": this.system.costPerLevel = 3; break;
                case "OVERALL": this.system.costPerLevel = 12; break;
            }
        }

        if (this.system.XMLID == "STRIKING_APPEARANCE") {
            switch (this.system.OPTION) {
                case "ALL": this.system.costPerLevel = 3; break;
                default: this.system.costPerLevel = 2;
            }
        }

        // ATTACK
        if (configPowerInfo && configPowerInfo.powerType?.includes("attack")) {
            const attack = 'attack'
            if (this.system.subType != attack) {
                this.system.subType = attack
                changed = true
                this.makeAttack()
            }

            // newValue = undefined
            // switch (this.system.INPUT) {
            //     case "PD": newValue = "physical"
            //         break;
            //     case "ED": newValue = "energy"
            //         break;
            //     // default:
            //     //     newValue = undefined
            // }
            // if (this.system.class != newValue) {
            //     this.system.class = newValue
            //     changed = true
            // }

            // MENTALBLAST
            // if (configPowerInfo.XMLID === "EGOATTACK") {
            //     this.system.class = 'mental'
            //     this.system.targets = "dmcv"
            //     this.system.uses = "omcv"
            //     this.system.knockbackMultiplier = 0
            //     this.system.usesStrength = false
            //     this.system.stunBodyDamage = "stunonly"
            //     this.system.noHitLocations = true
            // }

            // DRAIN
            // if (configPowerInfo.XMLID === "DRAIN") {
            //     this.system.class = 'drain'
            //     this.system.usesStrength = false
            //     this.system.noHitLocations = true
            // }

            // AID
            // if (configPowerInfo.XMLID === "AID") {
            //     this.system.class = 'aid'
            //     this.system.usesStrength = false
            //     this.system.noHitLocations = true
            // }

            // isKilling
            //this.system.killing = configPowerInfo?.killing

        }

        // BASECOST
        const newBaseValue = parseFloat(CONFIG.HERO.ModifierOverride[this.system.XMLID]?.BASECOST || this.system.BASECOST || 0) // || parseFloat(configPowerInfo?.cost || 0)
        if (this.system.baseCost != newBaseValue) {
            this.system.baseCost = newBaseValue
            changed = true
        }

        // BASECOST (children)
        for (const key of HeroSystem6eItem.ItemXmlChildTags) {
            if (this.system[key]) {
                for (const child of this.system[key]) {
                    let newChildValue

                    switch (child.XMLID) {
                        case "AOE":
                            if (child.OPTION == "RADIUS" && parseInt(child.LEVELS) <= 32) newChildValue = 1.0
                            if (child.OPTION == "RADIUS" && parseInt(child.LEVELS) <= 16) newChildValue = 0.75
                            if (child.OPTION == "RADIUS" && parseInt(child.LEVELS) <= 8) newChildValue = 0.50
                            if (child.OPTION == "RADIUS" && parseInt(child.LEVELS) <= 4) newChildValue = 0.25

                            if (child.OPTION == "CONE" && parseInt(child.LEVELS) <= 64) newChildValue = 1.0
                            if (child.OPTION == "CONE" && parseInt(child.LEVELS) <= 32) newChildValue = 0.75
                            if (child.OPTION == "CONE" && parseInt(child.LEVELS) <= 16) newChildValue = 0.50
                            if (child.OPTION == "CONE" && parseInt(child.LEVELS) <= 8) newChildValue = 0.25

                            if (child.OPTION == "LINE" && parseInt(child.LEVELS) <= 125) newChildValue = 1.0
                            if (child.OPTION == "LINE" && parseInt(child.LEVELS) <= 64) newChildValue = 0.75
                            if (child.OPTION == "LINE" && parseInt(child.LEVELS) <= 32) newChildValue = 0.50
                            if (child.OPTION == "LINE" && parseInt(child.LEVELS) <= 16) newChildValue = 0.25

                            if (child.OPTION == "SURFACE" && parseInt(child.LEVELS) <= 16) newChildValue = 1.0
                            if (child.OPTION == "SURFACE" && parseInt(child.LEVELS) <= 8) newChildValue = 0.75
                            if (child.OPTION == "SURFACE" && parseInt(child.LEVELS) <= 4) newChildValue = 0.50
                            if (child.OPTION == "SURFACE" && parseInt(child.LEVELS) <= 2) newChildValue = 0.25

                            if (child.OPTION == "AREA" && parseInt(child.LEVELS) <= 16) newChildValue = 1.0
                            if (child.OPTION == "AREA" && parseInt(child.LEVELS) <= 8) newChildValue = 0.75
                            if (child.OPTION == "AREA" && parseInt(child.LEVELS) <= 4) newChildValue = 0.50
                            if (child.OPTION == "AREA" && parseInt(child.LEVELS) <= 2) newChildValue = 0.25

                            break;

                        case "REQUIRESASKILLROLL":
                            // <MODIFIER XMLID="REQUIRESASKILLROLL" ID="1589145772288" BASECOST="0.25" LEVELS="0" ALIAS="Requires A Roll" POSITION="-1" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" OPTION="14" OPTIONID="14" OPTION_ALIAS="14- roll" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" COMMENTS="" PRIVATE="No" FORCEALLOW="No">
                            // This is a limitation not an advantage, not sure why it is positive.  Force it negative.
                            newChildValue = - Math.abs(parseFloat(child.BASECOST))
                            break;

                        default:
                            newChildValue = parseFloat(CONFIG.HERO.ModifierOverride[child.XMLID]?.BASECOST || child.BASECOST || 0)
                            break;
                    }

                    for (const key of HeroSystem6eItem.ItemXmlChildTags) {
                        if (child[key]) {
                            for (const child2 of child[key]) {
                                const newChild2Value = parseFloat(CONFIG.HERO.ModifierOverride[child.XMLID]?.BASECOST || child2.BASECOST || 0)
                                if (child2.baseCost != newChild2Value) {
                                    child2.baseCost = newChild2Value
                                    changed = true
                                }
                            }

                        }
                    }

                    if (child.baseCost != newValue) {
                        child.baseCost = newValue
                        changed = true
                    }
                }
            }
        }

        changed = this.calcItemPoints() || changed

        // DESCRIPTION
        const oldDescription = this.system.description
        this.updateItemDescription()
        changed = (oldDescription != this.system.description) || changed

        // Save changes
        if (changed && this.id) {
            await this.update({ 'system': this.system })
        }

        // ACTIVE EFFECTS
        if (changed && this.id && configPowerInfo && configPowerInfo.powerType?.includes("movement")) {
            let activeEffect = Array.from(this.effects)?.[0] || {}
            activeEffect.name = (this.name ? `${this.name}: ` : "") + `${this.system.XMLID} +${this.system.value}`
            activeEffect.icon = 'icons/svg/upgrade.svg'
            activeEffect.changes = [
                {
                    key: `system.characteristics.${this.system.XMLID.toLowerCase()}.max`,
                    value: this.system.value,
                    mode: CONST.ACTIVE_EFFECT_MODES.ADD
                },
            ]
            activeEffect.transfer = true

            if (activeEffect.update) {
                await activeEffect.update({ 'name': activeEffect.name, 'changes': activeEffect.changes })
                await this.actor.update({ [`system.characteristics.${this.system.XMLID.toLowerCase()}.value`]: this.actor.system.characteristics[this.system.XMLID.toLowerCase()].max })
            } else {
                await this.createEmbeddedDocuments("ActiveEffect", [activeEffect])
            }
        }


        if (changed && this.id && configPowerInfo?.powerType?.includes("characteristic")) {
            let activeEffect = Array.from(this.effects)?.[0] || {}
            activeEffect.name = (this.name ? `${this.name}: ` : "") + `${this.system.XMLID} +${this.system.value}`
            activeEffect.icon = 'icons/svg/upgrade.svg'
            activeEffect.changes = [
                {
                    key: `system.characteristics.${this.system.XMLID.toLowerCase()}.max`,
                    value: this.system.value,
                    mode: CONST.ACTIVE_EFFECT_MODES.ADD
                },
            ]
            activeEffect.transfer = true

            if (activeEffect.update) {
                const oldMax = this.actor.system.characteristics[this.system.XMLID.toLowerCase()].max
                await activeEffect.update({ 'name': activeEffect.name, 'changes': activeEffect.changes })
                const deltaMax = this.actor.system.characteristics[this.system.XMLID.toLowerCase()].max - oldMax
                await this.actor.update({ [`system.characteristics.${this.system.XMLID.toLowerCase()}.value`]: this.actor.system.characteristics[this.system.XMLID.toLowerCase()].value + deltaMax })

            } else {
                await this.createEmbeddedDocuments("ActiveEffect", [activeEffect])
            }
        }

        if (changed && this.id && this.system.XMLID === "DENSITYINCREASE") {
            const strAdd = Math.floor(this.system.value) * 5
            const pdAdd = Math.floor(this.system.value)
            const edAdd = Math.floor(this.system.value)

            let activeEffect = Array.from(this.effects)?.[0] || {}
            activeEffect.name = (this.name ? `${this.name}: ` : "") + `${this.system.XMLID} ${this.system.value}`
            activeEffect.icon = 'icons/svg/upgrade.svg'
            activeEffect.changes = [
                {
                    key: "system.characteristics.str.max",
                    value: strAdd,
                    mode: CONST.ACTIVE_EFFECT_MODES.ADD
                },
                {
                    key: "system.characteristics.pd.max",
                    value: pdAdd,
                    mode: CONST.ACTIVE_EFFECT_MODES.ADD
                },
                {
                    key: "system.characteristics.ed.max",
                    value: edAdd,
                    mode: CONST.ACTIVE_EFFECT_MODES.ADD
                }
            ]
            activeEffect.transfer = true

            if (activeEffect.update) {
                await activeEffect.update({ 'name': activeEffect.name, 'changes': activeEffect.changes })
                await this.actor.update({ [`system.characteristics.str.value`]: this.actor.system.characteristics.str.max })
                await this.actor.update({ [`system.characteristics.pd.value`]: this.actor.system.characteristics.pd.max })
                await this.actor.update({ [`system.characteristics.ed.value`]: this.actor.system.characteristics.ed.max })

            } else {
                await this.createEmbeddedDocuments("ActiveEffect", [activeEffect])
            }

        }

        // 5e GROWTH
        // Growth (+10 STR, +2 BODY, +2 STUN, -2" KB, 400 kg, +0 DCV, +0 PER Rolls to perceive character, 3 m tall, 2 m wide)
        if (changed && this.id && this.system.XMLID === "GROWTH") {
            const strAdd = Math.floor(this.system.value) * 5
            const bodyAdd = Math.floor(this.system.value)
            const stunAdd = Math.floor(this.system.value)

            let activeEffect = Array.from(this.effects)?.[0] || {}
            activeEffect.name = (this.name ? `${this.name}: ` : "") + `${this.system.XMLID} ${this.system.value}`
            activeEffect.icon = 'icons/svg/upgrade.svg'
            activeEffect.changes = [
                {
                    key: "system.characteristics.str.max",
                    value: strAdd,
                    mode: CONST.ACTIVE_EFFECT_MODES.ADD
                },
                {
                    key: "system.characteristics.body.max",
                    value: bodyAdd,
                    mode: CONST.ACTIVE_EFFECT_MODES.ADD
                },
                {
                    key: "system.characteristics.stun.max",
                    value: stunAdd,
                    mode: CONST.ACTIVE_EFFECT_MODES.ADD
                }
            ]
            activeEffect.transfer = true

            if (activeEffect.update) {
                await activeEffect.update({ 'name': activeEffect.name, 'changes': activeEffect.changes })
                await this.actor.update({ [`system.characteristics.str.value`]: this.actor.system.characteristics.str.max })
                await this.actor.update({ [`system.characteristics.pd.value`]: this.actor.system.characteristics.pd.max })
                await this.actor.update({ [`system.characteristics.ed.value`]: this.actor.system.characteristics.ed.max })

            } else {
                await this.createEmbeddedDocuments("ActiveEffect", [activeEffect])
            }

        }

        return changed
    }



    getAttacksWith() {
        const configPowerInfo = getPowerInfo({ item: this })
        if (configPowerInfo.powerType.includes("mental")) return 'omcv'
        return 'ocv';
    }
    getDefendsWith() {
        const configPowerInfo = getPowerInfo({ item: this })
        if (configPowerInfo.powerType.includes("mental")) return 'dmcv'
        return 'dcv';
    }

    getAllChildren() {
        let results = []
        for (let key of HeroSystem6eItem.ItemXmlChildTags) {
            if (this.system?.[key]) {
                results = results.concat(this.system?.[key])
            }
        }
        return results
    }


    static itemDataFromXml(xml) {
        const parser = new DOMParser()
        const xmlDoc = parser.parseFromString(xml, 'text/xml')
        const heroJson = {};
        HeroSystem6eActor._xmlToJsonNode(heroJson, xmlDoc.children)

        let itemData = {
            name: 'undefined',
            type: 'power',
        }

        for (let itemTag of [...HeroSystem6eItem.ItemXmlTags, ...CONFIG.HERO.powers.filter(o => o.powerType?.includes("characteristic")).map(o => o.key)]) {
            let itemSubTag = itemTag.replace(/S$/, "").replace("MARTIALART", "MANEUVER")
            if (heroJson[itemSubTag]) {
                for (let system of (Array.isArray(heroJson[itemSubTag]) ? heroJson[itemSubTag] : [heroJson[itemSubTag]])) {
                    itemData = {
                        name: system?.ALIAS || system?.XMLID || itemTag,  // simplistic name for now
                        type: CONFIG.HERO.powers.filter(o => o.powerType?.includes("characteristic")).map(o => o.key) ? "power" : itemTag.toLowerCase().replace(/s$/, ''),
                        system: system,
                    }

                    return itemData
                }
            }
        }


        return itemData
    }

    getHdcParent() {
        if (!this.system.PARENTID) return null
        return this.actor.items.find(o => o.system.ID == this.system.PARENTID)
    }

    calcItemPoints() {
        let changed = false
        changed = this.calcBasePointsPlusAdders() || changed
        changed = this.calcActivePoints() || changed
        changed = this.calcRealCost() || changed
        return changed
    }

    calcBasePointsPlusAdders() {
        let system = this.system;
        let actor = this.actor;

        let old = system.basePointsPlusAdders;


        if (!system.XMLID)
            return 0


        if (this.system.XMLID === "TRANSPORT_FAMILIARITY") {
            console.log(this)
        }

        // Everyman skills are free
        if (system.EVERYMAN) {
            system.basePointsPlusAdders = 0;
            return { changed: old != system.basePointsPlusAdders };
        }

        // Native Tongue
        if (system.NATIVE_TONGUE) {
            system.basePointsPlusAdders = 0;
            return { changed: old != system.basePointsPlusAdders };
        }

        // Check if we have CONFIG info about this power
        const configPowerInfo = getPowerInfo({ xmlid: system.XMLID, actor: actor })


        // Base Cost is typcailly extracted directly from HDC
        let baseCost = system.baseCost //parseInt(system.BASECOST)

        // PowerFramework might be important
        let parentItem = this.getHdcParent();
        let configPowerInfoParent = null;
        if (parentItem) {
            configPowerInfoParent = getPowerInfo({ xmlid: parentItem.system.XMLID, actor: actor })
        }


        if (system.XMLID === "COMBAT_LEVELS") {
            console.log(this)
        }

        // Cost per level is NOT included in the HDC file.
        // We will try to get cost per level via config.js
        // Default cost per level will be BASECOST, or 3/2 for skill, or 1 for everything else
        //const characteristicCosts = actor?.system?.is5e ? CONFIG.HERO.characteristicCosts5e : CONFIG.HERO.characteristicCosts
        let costPerLevel = parseFloat(
            system.costPerLevel ||
            configPowerInfo?.costPerLevel ||
            configPowerInfo?.cost ||
            (configPowerInfo?.powerType == 'skill' ? 2 : 0) ||
            baseCost ||
            1
        )

        // FLASH (target group cost 5 per level, non-targeting costs 3 per level)
        if (system.XMLID === "FLASH") {
            if (system.OPTIONID === "SIGHTGROUP") { // The only targeting group
                costPerLevel = 5;
            } else {
                costPerLevel = 3;
            }
        }

        // But configPowerInfo?.costPerLevel could actually be 0 (EXTRALIMBS)
        if (configPowerInfo?.costPerLevel != undefined) {
            costPerLevel = parseFloat(configPowerInfo?.costPerLevel)
        }

        let levels = parseInt(system.value) || 0

        let subCost = costPerLevel * levels

        // 3 CP per 2 points
        if (costPerLevel == 3 / 2 && subCost % 1) {
            let _threePerTwo = Math.ceil(costPerLevel * levels) + 1
            subCost = _threePerTwo
            system.title = (system.title || "") + '3 CP per 2 points; \n+1 level may cost nothing. '
        }

        // FORCEWALL/BARRIER
        if (system.XMLID == "FORCEWALL") {
            baseCost += (parseInt(system.BODYLEVELS) || 0)
            baseCost += (parseInt(system.LENGTHLEVELS) || 0)
            baseCost += (parseInt(system.HEIGHTLEVELS) || 0)
            baseCost += (Math.ceil(parseFloat(system.WIDTHLEVELS * 2)) || 0)  // per +½m of thickness
        }

        // Start adding up the costs
        let cost = baseCost + subCost

        if (system.XMLID === "FOLLOWER") {
            cost = Math.ceil((parseInt(system.BASEPOINTS) || 5) / 5)
            let multiplier = Math.ceil(Math.sqrt(parseInt(system.NUMBER) || 0)) + 1
            cost *= multiplier
        }

        // ADDERS
        let adderCost = 0
        for (let adder of (system.ADDER || [])) {
            // Some adders kindly provide a base cost. Some, however, are 0 and so fallback to the LVLCOST and hope it's provided
            const adderBaseCost = adder.baseCost || parseInt(adder.LVLCOST)

            if (adder.SELECTED != false) { //TRANSPORT_FAMILIARITY
                let adderLevels = Math.max(1, parseInt(adder.LEVELS))
                adderCost += Math.ceil(adderBaseCost * adderLevels)  // ceil is for ENTANGLE +5 PD
            }

            let subAdderCost = 0

            for (let adder2 of (adder.ADDER || [])) {
                const adder2BaseCost = adder2.baseCost

                if (adder2.SELECTED != false) {
                    let adderLevels = Math.max(1, parseInt(adder2.LEVELS))
                    subAdderCost += Math.ceil(adder2BaseCost * adderLevels)
                }
            }

            // TRANSPORT_FAMILIARITY checking more than 2 animals costs same as entire category
            if (!adder.SELECTED && subAdderCost > (adderBaseCost || 99)) {
                subAdderCost = adderBaseCost
            }

            // Riding discount
            if (this.system.XMLID === "TRANSPORT_FAMILIARITY" && this.actor && subAdderCost > 0) {
                if (adder.XMLID === "RIDINGANIMALS" && this.actor.items.find(o => o.system.XMLID === "RIDING")) {
                    subAdderCost -= 1
                }
            }

            adderCost += subAdderCost

        }


        // Categorized skills cost 2 per catory and +1 per each subcategory.
        // If no catagories selected then assume 3 pts
        // if (configPowerInfo?.categorized && adderCost >= 4) {
        //     if (adderCost == 0) {
        //         adderCost = 3
        //     } else {
        //         adderCost = Math.floor(adderCost / 2) + 1
        //     }
        // }



        // POWERS (likely ENDURANCERESERVEREC)
        if (system.POWER) {
            for (let adder of system.POWER) {
                let adderBaseCost = adder.baseCost //parseFloat(adder.BASECOST)
                let adderLevels = Math.max(1, parseInt(adder.LEVELS))
                adderCost += Math.ceil(adderBaseCost * adderLevels);
            }
        }

        // Skill Enhancer discount (a hidden discount; not shown in item description)
        if (configPowerInfoParent && configPowerInfoParent.powerType?.includes("enhancer")) {
            cost = Math.max(1, cost - 1);
        }

        cost += adderCost



        // INDEPENDENT ADVANTAGE (aka Naked Advantage)
        // NAKEDMODIFIER uses PRIVATE=="No" to indicate NAKED modifier
        if (system.XMLID == "NAKEDMODIFIER" && system.MODIFIER) {
            let advantages = 0
            for (let modifier of (system.MODIFIER || []).filter(o => !o.PRIVATE)) {
                advantages += modifier.baseCost //parseFloat(modifier.BASECOST)
            }
            cost = cost * advantages
        }


        system.basePointsPlusAdders = cost;

        //return cost; //Math.max(1, cost)
        return (old != system.basePointsPlusAdders);
    }

    calcActivePoints() {
        let system = this.system;
        // Active Points = (Base Points + cost of any Adders) x (1 + total value of all Advantages)

        // if (system.XMLID == "ARMOR")
        //     HEROSYS.log(false, system.XMLID)

        let advantages = 0;
        let advantagesDC = 0;
        let minAdvantage = 0;

        // if (this.system.XMLID === "SWIMMING") {
        //     console.log(this)
        // }

        for (let modifier of (system.MODIFIER || []).filter(o =>
            (system.XMLID != "NAKEDMODIFIER" || o.PRIVATE)
            && parseFloat(o.baseCost) >= 0
        )) {
            let _myAdvantage = 0
            const modifierBaseCost = parseFloat(modifier.baseCost || 0)
            const costPerLevel = parseFloat(modifier.costPerLevel || 0)
            const levels = Math.max(1, parseFloat(modifier.LEVELS))
            switch (modifier.XMLID) {
                case "AOE":
                    _myAdvantage += modifierBaseCost;
                    break;

                case "CUMULATIVE":
                    _myAdvantage += modifierBaseCost + (levels * 0.25);
                    break;

                default:
                    _myAdvantage += modifierBaseCost * levels;
            }

            // Some modifiers may have ADDERS
            const adders = (modifier.ADDER || []) //modifier.getElementsByTagName("ADDER")
            if (adders.length) {
                for (let adder of adders) {
                    const adderBaseCost = parseFloat(adder.baseCost || 0)
                    _myAdvantage += adderBaseCost;
                    minAdvantage = 0.25
                }
            }

            // No negative advantages and minimum is 1/4
            advantages += Math.max(minAdvantage, _myAdvantage)
            modifier.BASECOST_total = _myAdvantage


            // For attacks with Advantages, determine the DCs by
            // making a special Active Point calculation that only counts
            // Advantages that directly affect how the victim takes damage.
            let powerInfo = getPowerInfo({ xmlid: system.XMLID })
            let modifierInfo = getModifierInfo({ xmlid: modifier.XMLID })
            if (powerInfo && powerInfo.powerType?.includes("attack")) {
                if (modifierInfo && modifierInfo.dc) {
                    advantagesDC += Math.max(0, _myAdvantage)
                }
            }
        }

        const _activePoints = system.basePointsPlusAdders * (1 + advantages)
        system.activePointsDc = RoundFavorPlayerDown(system.basePointsPlusAdders * (1 + advantagesDC))


        // This may be a slot in a framework if so get parent
        // const parent = item.actor.items.find(o=> o.system.ID === system.PARENTID);

        // HALFEND is based on active points without the HALFEND modifier
        if (this.findModsByXmlid("REDUCEDEND")) {
            system._activePointsWithoutEndMods = system.basePointsPlusAdders * (1 + advantages - 0.25);
        }

        let old = system.activePoints;
        system.activePoints = RoundFavorPlayerDown(_activePoints || 0);

        //return RoundFavorPlayerDown(_activePoints)
        const changed = old != system.activePoints
        return changed
    }

    calcRealCost() {
        let system = this.system;
        // Real Cost = Active Cost / (1 + total value of all Limitations)

        // if (system.XMLID == "RKA")
        //     HEROSYS.log(false, system.XMLID)

        // This may be a slot in a framework if so get parent
        const parent = this.getHdcParent()// item.actor ? item.actor.items.find(o => o.system.ID === system.PARENTID) : null;

        let modifiers = (system.MODIFIER || []).filter(o => parseFloat(o.baseCost) < 0)

        // Add limitations from parent
        if (parent) {
            modifiers.push(...(parent.system.MODIFIER || []).filter(o => parseFloat(o.baseCost) < 0))
        }

        let limitations = 0
        for (let modifier of modifiers) {
            let _myLimitation = 0
            const modifierBaseCost = parseFloat(modifier.baseCost || 0)
            _myLimitation += -modifierBaseCost;

            // Some modifiers may have ADDERS as well (like a focus)
            for (let adder of (modifier.ADDER || [])) {
                let adderBaseCost = parseFloat(adder.baseCost || 0)

                // Unique situation where JAMMED floors the limitation
                if (adder.XMLID == "JAMMED" && _myLimitation == 0.25) {
                    system.title = (system.title || "") + 'Limitations are below the minumum of -1/4; \nConsider removing unnecessary limitations. '
                    adderBaseCost = 0
                }

                // can be positive or negative (like charges).
                // Requires a roll gets interesting with Jammed / Can choose which of two rolls to make from use to use
                _myLimitation += -adderBaseCost;

                const multiplier = Math.max(1, parseFloat(adder.MULTIPLIER || 0))
                _myLimitation *= multiplier
            }


            // NOTE: REQUIRESASKILLROLL The minimum value is -1/4, regardless of modifiers.
            if (_myLimitation < 0.25) {

                // if (game.settings.get(game.system.id, 'alphaTesting')) {
                //     ui.notifications.warn(`${system.XMLID} ${modifier.XMLID} has a limiation of ${-_myLimitation}.  Overrided limitation to be -1/4.`)
                //     console.log(`${system.XMLID} ${modifier.XMLID} has a limiation of ${-_myLimitation}.  Overrided limitation to be -1/4.`, system)
                // }
                _myLimitation = 0.25
                system.title = (system.title || "") + 'Limitations are below the minumum of -1/4; \nConsider removing unnecessary limitations. '
            }

            //console.log("limitation", modifier.ALIAS, _myLimitation)
            modifier.BASECOST_total = -_myLimitation

            limitations += _myLimitation
        }

        // if (this.system.XMLID === "SWIMMING") {
        //     console.log(this)
        // }

        let _realCost = system.activePoints / (1 + limitations)

        // ADD_MODIFIERS_TO_BASE
        if (this.system.ADD_MODIFIERS_TO_BASE && this.actor) {
            const _base = this.actor.system.characteristics[this.system.XMLID.toLowerCase()].core
            const _cost = getPowerInfo({ xmlid: this.system.XMLID, actor: this.actor }).cost || 1
            const _baseCost = _base * _cost
            const _discount = _baseCost - RoundFavorPlayerDown(_baseCost / (1 + limitations))
            _realCost -= _discount
        }


        // MULTIPOWER
        let costSuffix = "";
        if (parent && parent.system.XMLID === "MULTIPOWER") {
            // Fixed
            if (this.system.ULTRA_SLOT) {
                costSuffix = "f";
                _realCost /= 10.0;
            } else

            // Variable
            {
                costSuffix = "v";
                _realCost /= 5.0;
            }

        }



        _realCost = RoundFavorPlayerDown(_realCost)

        // Minumum cost
        if (_realCost == 0 && system.activePoints > 0) {
            _realCost = 1
        }

        let old = system.realCost;
        system.realCost = _realCost + costSuffix;

        const changed = old != system.realCost
        return changed
    }

    updateItemDescription() {
        // Description (eventual goal is to largely match Hero Designer)
        // TODO: This should probably be moved to the sheets code
        // so when the power is modified in foundry, the power
        // description updates as well.
        // If in sheets code it may handle drains/suppresses nicely.

        const system = this.system;
        const type = this.type;

        const configPowerInfo = getPowerInfo({ xmlid: system.XMLID, actor: this.actor })

        // This may be a slot in a framework if so get parent
        //const parent = this.parent()

        switch (configPowerInfo?.xmlid || system.XMLID) {
            case "DENSITYINCREASE":
                // Density Increase (400 kg mass, +10 STR, +2 PD/ED, -2" KB); IIF (-1/4)
                system.description = `${system.ALIAS} (${Math.pow(system.value, 2) * 100} kg mass, +${system.value * 5} STR, +${system.value} PD/ED, -${this.actor?.system.is5e ? system.value + "\"" : system.value * 2 + "m"} KB)`
                break;

            case "GROWTH":
                //Growth (+10 STR, +2 BODY, +2 STUN, -2" KB, 400 kg, +0 DCV, +0 PER Rolls to perceive character, 3 m tall, 2 m wide), Reduced Endurance (0 END; +1/2), Persistent (+1/2); Always On (-1/2), IIF (-1/4)
                system.description = `${system.ALIAS} (+${system.value * 5} STR, +${system.value} BODY, +${system.value} STUN, -${this.actor?.system.is5e ? system.value + "\"" : system.value * 2 + "m"} KB, ${system.ALIAS} (${Math.pow(system.value, 2) * 100} kg mass)`
                break;

            case "MENTALDEFENSE":
            case "POWERDEFENSE":
                system.description = `${system.ALIAS} ${system.value} points`
                break;

            case "FLASHDEFENSE":
                system.description = `${system.OPTION_ALIAS} ${system.ALIAS} (${system.value} point${ system.value > 1 ? "s" : ""})` // PH: FIXME: Not happy with this kludgy singular vs plural.
                break;

            case "FOLLOWER":
                system.description = system.ALIAS.replace("Followers: ", "")
                break;

            case "MINDSCAN":
                {
                    const dice = convertFromDC(this, convertToDcFromItem(this).dc).replace("d6 + 1d3", " 1/2d6")
                    system.description = `${dice} ${system.ALIAS}`
                }
                break;

            case "FORCEFIELD":
            case "ARMOR":
            case "DAMAGERESISTANCE":
                system.description = system.ALIAS + " ("
                let ary = []
                if (parseInt(system.PDLEVELS)) ary.push(system.PDLEVELS + " PD")
                if (parseInt(system.EDLEVELS)) ary.push(system.EDLEVELS + " ED")
                if (parseInt(system.MDLEVELS)) ary.push(system.MDLEVELS + " MD")
                if (parseInt(system.POWDLEVELS)) ary.push(system.POWDLEVELS + " POW")
                system.description += ary.join("/") + ")"
                break;

            case "FORCEWALL":
                system.description = system.ALIAS + " "
                let aryFW = []
                if (parseInt(system.PDLEVELS)) aryFW.push(system.PDLEVELS + " PD")
                if (parseInt(system.EDLEVELS)) aryFW.push(system.EDLEVELS + " ED")
                if (parseInt(system.MDLEVELS)) aryFW.push(system.MDLEVELS + " MD")
                if (parseInt(system.POWDLEVELS)) aryFW.push(system.POWDLEVELS + " POW")
                if (parseInt(system.BODYLEVELS)) aryFW.push(system.BODYLEVELS + " BODY")
                system.description += aryFW.join("/")
                system.description += `(up to ${parseInt(system.LENGTHLEVELS) + 1}m long, and ${parseInt(system.HEIGHTLEVELS) + 1}m tall, and ${parseFloat(system.WIDTHLEVELS) + 0.5}m thick)`
                break;

            case "TRANSFER":
            case "DRAIN":
            case "AID":
                // Aid  STR 5d6 (standard effect: 15 points)
                system.description = system.ALIAS + (system.INPUT ? " " + system.INPUT : "") + " " + system.value + "d6"


                // Overwrite Name if equals the ALIAS
                // if (this.update && system.INPUT && this.name === system.ALIAS) {
                //     this.name = `${system.ALIAS} ${system.INPUT}`
                //     this.update({ name: item.name });
                // }
                break;

            case "STRETCHING":
                system.description = system.ALIAS + " " + system.value + "m"
                break;

            case "RUNNING":
            case "SWIMMING":
            case "LEAPING":
            case "TELEPORTATION":
                // Running +25m (12m/37m total)
                system.description = system.ALIAS + " +" + system.value + (this.actor?.system?.is5e ? '"' : 'm')
                break;

            case "TUNNELING":
                // Tunneling 22m through 10 PD materials
                let defbonus = (system.ADDER || []).find(o => o.XMLID == "DEFBONUS")
                let pd = 1 + parseInt(defbonus?.LEVELS || 0)
                system.description = `${system.ALIAS} +${system.value}m through ${pd} PD materials`
                break;

            case "NAKEDMODIFIER":
                // Area Of Effect (8m Radius; +1/2) for up to 53 Active Points of STR
                // Naked Advantage: Reduced Endurance (0 END; +1/2) for up to 70 Active Points (35 Active Points); Gestures (Requires both hands; -1/2), Linked to Opening of the Blind, Third Eye (Opening of the Blind, Third Eye; -1/4), Visible (Tattoos of flames encompass the biceps and shoulders.  When this power is active, these flames appear to burn, emitting firelight.  ; -1/4)
                system.description = `${system.ALIAS} for up to ${system.value} Active points`
                if (system.INPUT) {
                    system.description += ` of ${system.INPUT}`
                }
                break;

            case "DEFENSE_MANEUVER":
                system.description = system.ALIAS + " " + system.OPTION_ALIAS
                break;

            case "LANGUAGES":
                //English:  Language (basic conversation) (1 Active Points)
                system.description = (system.INPUT || system.ALIAS)
                if (system.OPTION_ALIAS) {
                    system.description += " (" + system.OPTION_ALIAS + ")"
                }
                break;

            case "KNOWLEDGE_SKILL":

                // 6e HDC
                //if (system.ALIAS == "KS") {
                // system.description = system.ALIAS + ": " + (system.NAME.replace(system.ALIAS, "") || system.INPUT || "")
                system.description = system.NAME.replace(system.ALIAS, "");
                if (system.description.indexOf(system.ALIAS) === -1) system.description += system.ALIAS;
                if (system.INPUT) system.description += `: ${system.INPUT}`;

                break;

            case "TRANSPORT_FAMILIARITY":
                //TF:  Custom Adder, Small Motorized Ground Vehicles
                //TF:  Equines, Small Motorized Ground Vehicles
                system.description = system.ALIAS + ": "
                break;

            case "MENTAL_COMBAT_LEVELS":
            case "PENALTY_SKILL_LEVELS":
                system.description = system.NAME + ": +" + system.value + " " + system.OPTION_ALIAS
                break;

            case "RKA":
            case "HKA":
            case "ENERGYBLAST":
            case "EGOATTACK":
            case "MINDCONTROL":
            case "HANDTOHANDATTACK":
                {
                    const dice = convertFromDC(this, convertToDcFromItem(this).dc).replace("d6 + 1d3", " 1/2d6")
                    system.description = `${system.ALIAS} ${dice}`
                }
                break;

            case "KBRESISTANCE":
                system.description = (system.INPUT ? system.INPUT + " " : "") + (system.OPTION_ALIAS || system.ALIAS)
                    + ` -${system.value}m`
                break;

            case "ENTANGLE":
                // Entangle 2d6, 7 PD/2 ED
                let pd_entangle = parseInt(system.value || 0) + parseInt(this.findModsByXmlid("ADDITIONALPD")?.LEVELS || 0)
                let ed_entangle = parseInt(system.value || 0) + parseInt(this.findModsByXmlid("ADDITIONALED")?.LEVELS || 0)
                system.description = `${system.ALIAS} ${system.value}d6, ${pd_entangle} PD/${ed_entangle} ED`
                break;

            case "ELEMENTAL_CONTROL":
                // Elemental Control, 12-point powers
                system.description = `${system.ALIAS}, ${parseInt(system.baseCost) * 2}-point powers`
                break;

            case "FLIGHT":
                // Flight 5m
                system.description = `${system.ALIAS} ${system.value}m`
                break;

            case "MANEUVER":

                system.description = "";


                // For most maneuvers we can use the EFFECT
                // if (system.EFFECT) {
                //     //system.description = system.EFFECT + ", ";
                //     // BLOCK or DODGE modifiers
                //     console.log(system);
                // }

                // Martial attacks typically add STR to description
                // let fullDice = system.dice;
                // let extraDice = 0;
                // switch (system.extraDice) {
                //     case 'pip':
                //         extraDice += 1;
                //         break
                //     case 'half':
                //         extraDice += 2;
                //         break
                // }

                // if (this.actor) {  // Make sure we have an actor
                //     // Convert dice to pips
                //     let pips = system.dice * 3;
                //     switch (system.extraDice) {
                //         case 'pip':
                //             pips += 1;
                //             break
                //         case 'half':
                //             pips += 2;
                //             break
                //     }

                //     // Add in STR
                //     if (system.usesStrength && this.actor) {
                //         let str = this.actor.system.characteristics.str.value
                //         let str5 = Math.floor(str / 5)
                //         if (system.killing) {
                //             pips += str5
                //         } else {
                //             pips += str5 * 3
                //         }
                //     }

                //     // Convert pips to DICE
                //     fullDice = Math.floor(pips / 3)
                //     extraDice = pips - fullDice * 3
                // }

                // let DC = convertToDcFromItem(this)


                // Offensive Strike:  1/2 Phase, -2 OCV, +1 DCV, 8d6 Strike
                // Killing Strike:  1/2 Phase, -2 OCV, +0 DCV, HKA 1d6 +1
                //`${system.ALIAS}:`
                if (system.PHASE) system.description += ` ${system.PHASE} Phase`
                let ocv = parseInt(system.ocv || system.OCV);
                let dcv = parseInt(system.dcv || system.DCV);
                if (isNaN(ocv)) {
                    system.description += `, -- OCV`;
                } else {
                    system.description += `, ${ocv.signedString()} OCV`;
                }
                system.description += `, ${dcv.signedString()} DCV`
                if (system.EFFECT) {
                    let dc = convertToDcFromItem(this).dc;
                    if (dc) {
                        let damageDice = convertFromDC(this, dc);
                        if (damageDice) {
                            system.description += `,`;

                            if (system.CATEGORY === "Hand To Hand" && system.EFFECT.indexOf("KILLING") > -1) {
                                system.description += " HKA";
                            }
                            system.description += ` ${system.EFFECT.replace("[NORMALDC]", damageDice).replace("[KILLINGDC]", damageDice.replace("+ 1", "+1"))}`
                        }
                    } else {
                        system.description += ", " + system.EFFECT;
                    }

                }
                break;

            case "TELEKINESIS":
                //Psychokinesis:  Telekinesis (62 STR), Alternate Combat Value (uses OMCV against DCV; +0) 
                // (93 Active Points); Limited Range (-1/4), Only In Alternate Identity (-1/4), 
                // Extra Time (Delayed Phase, -1/4), Requires A Roll (14- roll; -1/4)
                system.description = `${system.ALIAS} (${system.value} STR)`
                break;

            case "MENTAL_COMBAT_LEVELS":
            case "COMBAT_LEVELS":
                // +1 with any single attack
                system.description = `+${system.value} ${system.OPTION_ALIAS}`;
                break;

            case "INVISIBILITY":
                // Invisibility to Hearing and Touch Groups  (15 Active Points); Conditional Power Only vs organic perception (-1/2)
                system.description = `${system.ALIAS}`;
                break;

            case "ENDURANCERESERVE":
                // Endurance Reserve  (20 END, 5 REC) (9 Active Points)
                system.description = `${system.ALIAS.replace('Endurance Reserve', '')}`;

                const ENDURANCERESERVEREC = this.findModsByXmlid("ENDURANCERESERVEREC")
                if (ENDURANCERESERVEREC) {
                    if (parseInt(system.value) === parseInt(system.max)) {
                        system.description += ` (${system.max} END, ${ENDURANCERESERVEREC.LEVELS} REC)`
                    } else {
                        system.description += ` (${system.value}/${system.max} END, ${ENDURANCERESERVEREC.LEVELS} REC)`
                    }
                }
                break;

            case "SKILL_LEVELS":
                //<i>Martial Practice:</i>  +10 with single Skill or Characteristic Roll
                system.description = `${parseInt(system.value).signedString()} ${system.OPTION_ALIAS}`;
                break;

            case "VPP":
            case "ELEMENTAL_CONTROL":
            case "MULTIPOWER":
                // <i>Repligun:</i>  Multipower, 60-point reserve, all slots Reduced Endurance (0 END; +1/2) (90 Active Points); all slots OAF Durable Expendable (Difficult to obtain new Focus; Ray gun; -1 1/4)
                let _descMultiPower = (system.OPTION_ALIAS || system.ALIAS || "")
                system.description = `${system.ALIAS}, ${parseInt(system.baseCost)}-point reserve`
                break;

            case "FLASH":
                //Sight and Hearing Groups Flash 5 1/2d6
                //Sight, Hearing and Mental Groups, Normal Smell, Danger Sense and Combat Sense Flash 5 1/2d6
                // Groups
                let _groups = [system.OPTION_ALIAS]
                for (let addr of (system.ADDER || []).filter(o => o.XMLID.indexOf("GROUP") > -1)) {
                    _groups.push(addr.ALIAS)
                }
                if (_groups.length === 1) {
                    system.description = _groups[0];
                } else {
                    system.description = _groups.slice(0, -1).join(", ").replace(/ Group/g, "");
                    system.description += " and " + _groups.slice(-1) + "s";
                }


                // spacing
                // if (_groups.length > 1) {
                //     system.description += ", ";
                // }

                // singles
                let _singles = [];
                for (let addr of (system.ADDER || []).filter(o => o.XMLID.indexOf("GROUP") === -1 && o.XMLID.match(/(NORMAL|SENSE|MINDSCAN|HRRP|RADAR|RADIO|MIND|AWARENESS)/))) {
                    _singles.push(addr.ALIAS);
                }
                if (_singles.length === 1) {
                    system.description += ", " + _singles[0];
                } else {
                    system.description += ", " + _singles.slice(0, -1).join(", ");
                    system.description += " and " + _singles.slice(-1);
                }

                const value3 = convertFromDC(this, convertToDcFromItem(this).dc).replace("d6 + 1d3", " 1/2d6")
                system.description += ` ${system.ALIAS} ${value3}`

                //system.description += ` ${system.ALIAS} ${system.value}d6 `;
                break;

            default:
                if (configPowerInfo && configPowerInfo.powerType?.includes("characteristic")) {
                    system.description = "+" + system.value + " " + system.ALIAS;
                    break;
                }

                let _desc = (system.OPTION_ALIAS || system.ALIAS || system.EFFECT || "")
                // if (system.INPUT) {
                //     const re = new RegExp(`^${system.INPUT}`, 'i')
                //     _desc = _desc.replace(re, "").trim();
                // }
                system.description = (system.INPUT ? system.INPUT + " " : "") + _desc;


                const value2 = convertFromDC(this, convertToDcFromItem(this).dc)
                if (value2 && !isNaN(value2)) {
                    if (system.description.indexOf(value2) === -1) {
                        system.description = ` ${value2} ${system.class || ""}`
                    }
                }


                // Skill Roll?
                if (type == 'skill') {
                    // let item = {
                    //     actor: this?.actor || this,
                    //     system: system
                    // }
                    // SkillRollUpdateValue(item)
                    // if (system.roll) {
                    //     system.description += ` ${system.roll}`
                    // }
                }
        }

        // Remove duplicate name from description and related cleanup
        let _rawName = this.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        try {
            let re = new RegExp(`^${_rawName}`, 'i')
            system.description = system.description.replace(re, "").trim();
            re = new RegExp(`: ${_rawName}$`, 'i')
            system.description = system.description.replace(re, "").trim();
            system.description = system.description.replace(/^: /, "").trim();
            system.description = system.description.replace(/^:/, "").trim();
            system.description = system.description.replace(/^Damage Reduction: /, "").trim();

        } catch (e) {
            ui.notifications.warn(`${item.actor.name} has item "${item.name.substr(0, 30)}" which failed to update item description`);
            console.log(e);
        }


        // ADDRS
        let _adderArray = []

        if (system.XMLID === "INVISIBILITY") {
            _adderArray.push(system.OPTION_ALIAS)
        }

        // The INPUT field isn't always displayed in HD so that is not strictly compatible, but it does mean that we will show things
        // like a ranged killing attack being ED vs PD in the power description.
        if(system?.INPUT) {
            _adderArray.push(system.INPUT)
        }

        if (system?.ADDER?.length > 0) {
            for (let adder of system.ADDER) {
                switch (adder.XMLID) {
                    case "DIMENSIONS":
                        system.description += ", " + adder.ALIAS
                        break

                    case "ADDITIONALPD":
                    case "ADDITIONALED":
                    case "DEFBONUS":
                        break

                    case "EXTENDEDBREATHING":
                        system.description += adder.ALIAS + " " + adder.OPTION_ALIAS
                        break

                    case "CONCEALABILITY":
                    case "REACTION":
                    case "SENSING":
                    case "SITUATION":
                    case "INTENSITY":
                    case "EFFECTS":
                    case "OCCUR":
                        _adderArray.push(adder.OPTION_ALIAS.replace("(", ""))
                        break

                    case "PHYSICAL":
                    case "ENERGY":
                    case "MENTAL":
                        // Damage Negation (-1 DCs Energy)
                        if (system.XMLID === "DAMAGENEGATION") {
                            if (parseInt(adder.LEVELS) != 0) _adderArray.push("-" + parseInt(adder.LEVELS) + " DCs " + adder.ALIAS.replace(" DCs", ""))
                        } else {
                            if (parseInt(adder.LEVELS) != 0) _adderArray.push("-" + parseInt(adder.LEVELS) + " " + adder.ALIAS)
                        }
                        break

                    case "PLUSONEHALFDIE":
                        //system.description = system.description.replace(/d6$/, " ") + adder.ALIAS.replace("+", "").replace(" ", "");
                        break

                    case "RIDINGANIMALS":
                        if (adder.SELECTED) {
                            _adderArray.push(adder.ALIAS)
                        } else {
                            for (let adder2 of adder?.adders || []) {
                                _adderArray.push(adder2.ALIAS)
                            }
                        }
                        break

                    default:
                        if (adder.ALIAS.trim()) {
                            _adderArray.push(adder.ALIAS)
                        }
                        break
                }
            }

            if (_adderArray.length > 0) {
                switch (system.XMLID) {
                    case "TRANSPORT_FAMILIARITY":
                        system.description += _adderArray.join("; ")
                        break

                    case "INVISIBILITY":
                        system.description += system.ALIAS + " to ";
                        // Groups
                        let _groups = _adderArray.filter(o => o.indexOf("Group") > -1);
                        if (_groups.length === 1) {
                            system.description += _groups[0];
                        } else {
                            system.description += _groups.slice(0, -1).join(", ").replace(/ Group/g, "");
                            system.description += " and " + _groups.slice(-1) + "s";
                        }

                        // spacing
                        if (_groups.length > 0) {
                            system.description += ", ";
                        }

                        // singles
                        let _singles = _adderArray.filter(o => o.indexOf("Group") === -1);
                        if (_singles.length === 1) {
                            system.description += _singles[0];
                        } else {
                            system.description += _singles.slice(0, -1).join(", ");
                            system.description += " and " + _singles.slice(-1);
                        }

                        break

                    case "FLASH":
                        // The senses are already in the description
                        system.description += " (" + _adderArray.filter(o => !o.match(/(GROUP|NORMAL|SENSE|MINDSCAN|HRRP|RADAR|RADIO|MIND|AWARENESS)/i)).join("; ") + ")"
                        system.description = system.description.replace("()", "");
                        break

                    default:
                        system.description += " (" + _adderArray.join("; ") + ")"
                        break
                }
            }
        }

        // Standard Effect
        if (system.USESTANDARDEFFECT) {
            let stun = parseInt(system.value * 3)
            let body = parseInt(system.value)

            if (this.findModsByXmlid("PLUSONEHALFDIE") || this.findModsByXmlid("PLUSONEPIP")) {
                stun += 1;
                body += 1;
            }

            if (configPowerInfo.powerType.includes("adjustment")) {
                system.description += " (standard effect: " + parseInt(system.value * 3) + " points)"
            } else {
                system.description += ` (standard effect: ${stun} STUN, ${body} BODY)`;
            }
        }

        // Advantages sorted low to high
        for (let modifier of (system.MODIFIER || []).filter(o => o.baseCost >= 0).sort((a, b) => { return a.BASECOST_total - b.BASECOST_total })) {
            system.description += this.createPowerDescriptionModifier(modifier)
        }

        // Active Points
        if (parseInt(system.realCost) != parseInt(system.activePoints) || this.getHdcParent()) {
            if (system.activePoints) {
                system.description += " (" + system.activePoints + " Active Points);"
            }
        }

        // MULTIPOWER slots typically include limitations
        let modifiers = (system.MODIFIER || []).filter(o => o.baseCost < 0).sort((a, b) => { return a.BASECOST_total - b.BASECOST_total })
        if (this.getHdcParent()) {
            modifiers.push(...(this.getHdcParent().system.MODIFIER || []).filter(o => o.baseCost < 0).sort((a, b) => { return a.BASECOST_total - b.BASECOST_total }))
        }

        // Disadvantages sorted low to high
        for (let modifier of modifiers) {
            system.description += this.createPowerDescriptionModifier(modifier)
        }

        system.description = system.description.replace(";,", ";").replace("; ,", ";").replace("; ;", ";").trim()

        // Endurance
        system.end = Math.max(1, RoundFavorPlayerDown(system.activePoints / 10) || 0)
        const costsEnd = this.findModsByXmlid("COSTSEND")
        const increasedEnd = this.findModsByXmlid("INCREASEDEND")
        if (increasedEnd) {
            system.end *= parseInt(increasedEnd.OPTION.replace('x', ''))
        }

        const reducedEnd = this.findModsByXmlid("REDUCEDEND") ||
            (this.getHdcParent() && this.getHdcParent().findModsByXmlid("REDUCEDEND"))
        if (reducedEnd && reducedEnd.OPTION === 'HALFEND') {
            system.end = RoundFavorPlayerDown((system._activePointsWithoutEndMods || system.activePoints) / 10)
            system.end = Math.max(1, RoundFavorPlayerDown(system.end / 2));
        }
        if (reducedEnd && reducedEnd.OPTION === 'ZERO') {
            system.end = 0;
        }

        // Some powers do not use Endurance
        if (!this.findModsByXmlid("COSTSEND")) {
            if (!configPowerInfo?.costEnd) {
                system.end = 0
            }

            // Charges typically do not cost END
            if (this.findModsByXmlid("CHARGES")) {
                system.end = 0;
            }
        }


        // STR only costs endurance when used.
        // Can get a bit messy, like when resisting an entangle, but will deal with that later.
        if (system.XMLID == "STR") {
            system.end = 0
        }

        // MOVEMENT only costs endurance when used.  Typically per round.
        if (configPowerInfo && configPowerInfo.powerType?.includes("movement")) {
            system.end = 0
        }

        // PERKS, TALENTS, COMPLICATIONS do not use endurance.
        if (["perk", "talent", "complication"]?.includes(type)) {
            system.end = 0
        }


    }

    createPowerDescriptionModifier(modifier) {

        let item = this

        let system = item.system
        let result = ""

        switch (modifier.XMLID) {
            case "CHARGES":
                // 1 Recoverable Continuing Charge lasting 1 Minute
                result += ", " + modifier.OPTION_ALIAS

                let recoverable = (modifier.ADDER || []).find(o => o.XMLID == "RECOVERABLE")
                if (recoverable) {
                    result += " " + recoverable.ALIAS
                }

                let continuing = (modifier.ADDER || []).find(o => o.XMLID == "CONTINUING")
                if (continuing) {
                    result += " " + continuing.ALIAS
                }

                result += parseInt(modifier.OPTION_ALIAS) > 1 ? " Charges" : " Charge"

                if (continuing) {
                    result += " lasting " + continuing.OPTION_ALIAS
                }

                break;
            case "FOCUS":
                result += ", " + modifier.ALIAS
                break;

            case "ABLATIVE":
                result += `, ${modifier.ALIAS} ${modifier.OPTION_ALIAS}`
                break;

            default:
                if (modifier.ALIAS) result += ", " + modifier.ALIAS || "?"


        }

        // if ((parseInt(modifier.LEVELS) || 0) > 1) {
        //     if (["HARDENED"].includes(modifier.XMLID)) {
        //         result += "x" + parseInt(modifier.LEVELS)
        //     }
        // }

        // ADDERS


        // if (modifier.comments) powerData.description += "; " + modifier.comments
        // if (modifier.option) powerData.description += "; " + modifier.option
        // if (modifier.optionId) powerData.description += "; " + modifier.optionId

        if (!["CONDITIONALPOWER"].includes(modifier.XMLID)) {
            result += " ("
        } else {
            result += " ";
        }


        // Multiple levels?
        if ((parseInt(modifier.LEVELS) || 0) > 1) {
            if (["HARDENED"].includes(modifier.XMLID)) {
                result += "x" + parseInt(modifier.LEVELS) + "; "
            }
        }

        if (["AOE"].includes(modifier.XMLID)) {

            // 5e has a calculated size
            if (item.actor?.system?.is5e) {
                let levels = 1;

                // not counting the Area Of Effect Advantage.
                let _activePointsWithoutAoeAdvantage = item.system.activePoints / (1 + modifier.BASECOST_total);
                switch (modifier.OPTIONID) {


                    case "CONE":
                        // +1 for a Cone with sides (1”+ (1” for
                        // every 5 Active Points in the power))
                        // long; double the length of the sides for
                        // each additional +¼
                        levels = 1 + Math.floor(parseInt(_activePointsWithoutAoeAdvantage || 0) / 5);
                        break;

                    case "HEX":
                        levels = 0;
                        break;

                    case "LINE":
                        // +1 for a Line 2” long for every 5 Active
                        // Points in the power; double the length,
                        // width, or height of the Line for each additional
                        // +¼
                        levels = Math.floor(parseInt(_activePointsWithoutAoeAdvantage || 0) / 5) * 2;
                        break;

                    case "RADIUS":
                        // +1 for a 1” Radius for every 10 Active
                        // Points in the power; double the Radius for
                        // each additional +¼
                        levels = 1 + Math.floor(parseInt(_activePointsWithoutAoeAdvantage || 0) / 10);
                        break;
                }

                const DOUBLEAREA = (modifier?.ADDER || []).find(o => o.XMLID === "DOUBLEAREA");
                if (DOUBLEAREA) {
                    levels *= (parseInt(DOUBLEAREA.LEVELS) * 2)
                }

                if (parseInt(modifier.LEVELS) != levels) {
                    modifier.LEVELS = levels;
                    if (item.update) {
                        item.update({ 'system.modifiers': item.system.modifiers });
                    }

                }
            }
            if (parseInt(modifier.LEVELS || 0) > 0) {
                result += parseInt(modifier.LEVELS) + (item.actor?.system?.is5e ? "\" " : "m ");
            }

        }


        if (modifier.XMLID == "CUMULATIVE" && (parseInt(modifier.LEVELS) > 0)) {
            result += parseInt(system.value) * 6 * (parseInt(modifier.LEVELS) + 1) + " points; "
        }

        if (modifier.OPTION_ALIAS && !["VISIBLE", "CHARGES", "AVAD", "ABLATIVE"].includes(modifier.XMLID)) {
            result += modifier.OPTION_ALIAS
            switch (modifier.XMLID) {
                case "EXTRATIME":
                    result += ", ";
                    break;
                case "CONDITIONALPOWER":
                    break;
                default:
                    result += "; ";
            }
        }

        if (modifier.INPUT) {
            result += modifier.INPUT + "; ";
        }

        //if (["REQUIRESASKILLROLL", "LIMITEDBODYPARTS"].includes(modifier.XMLID)) result += modifier.COMMENTS + "; "
        if (modifier.COMMENTS) result += modifier.COMMENTS + "; "
        for (let adder of (modifier.ADDER || [])) {
            switch (adder.XMLID) {

                case "DOUBLEAREA":
                    break;

                default:
                    result += adder.ALIAS + ", "
            }

        }

        let fraction = ""

        let BASECOST_total = modifier.BASECOST_total || modifier.baseCost

        if (BASECOST_total == 0) {
            fraction += "+0"
            // if (game.settings.get(game.system.id, 'alphaTesting')) {
            //     ui.notifications.warn(`${powerName} has an unhandeled modifier (${modifier.XMLID})`)
            // }
        }

        if (BASECOST_total > 0) {
            fraction += "+"
        }
        let wholeNumber = Math.trunc(BASECOST_total)

        if (wholeNumber != 0) {
            fraction += wholeNumber + " "
        }
        else if (BASECOST_total < 0) {
            fraction += "-"
        }
        switch (Math.abs(BASECOST_total % 1)) {
            case 0: break;
            case 0.25: fraction += "1/4"; break;
            case 0.5: fraction += "1/2"; break;
            case 0.75: fraction += "3/4"; break;
            default: fraction += BASECOST_total % 1;
        }

        if (["CONDITIONALPOWER"].includes(modifier.XMLID)) {
            result += " ("
        }

        result += fraction.trim() + ")"

        // Highly summarized
        if (["FOCUS"].includes(modifier.XMLID)) {
            //result = `, ${modifier.OPTION} (${fraction.trim()})`
            // 'Focus (OAF; Pen-sized Device in pocket; -1)'
            result = result.replace(`Focus (${modifier.OPTION}; `, `${modifier.OPTION} (`)
        }


        const configPowerInfo = getPowerInfo({ xmlid: system.XMLID, actor: item?.actor })

        // All Slots?  // This may be a slot in a framework if so get parent
        // const parent = item.actor.items.find(o => o.system.ID === system.PARENTID);
        if (configPowerInfo && configPowerInfo.powerType?.includes("framework")) {
            if (result.match(/^,/)) {
                result = result.replace(/^,/, ", all slots");
            } else {
                result = "all slots " + result;
            }

        }

        // Mind Control Inobvious Power, Invisible to Mental Group
        // Mind Control 15d6, Armor Piercing (+1/4), Reduced Endurance (1/2 END; +1/4), Telepathic (+1/4), Invisible Power Effects (Invisible to Mental Group; +1/4), Cumulative (180 points; +3/4) (206 Active Points); Extra Time (Full Phase, -1/2)
        // Mind Control 15d6, Armor Piercing (+1/4), Reduced Endurance (1/2 END; +1/4), Telepathic (+1/4), Invisible Power Effects (Invisible to Mental Group; +1/4), Cumulative (180 points; +3/4) (206 Active Points), Extra Time (Full Phase, -1/2)
        result = result.replace("Inobvious Power, Invisible ", "Invisible ");

        return result;
    }


    makeAttack() {
        const xmlid = this.system.XMLID

        // Confirm this is an attack
        const configPowerInfo = getPowerInfo({ xmlid: xmlid, actor: this.actor })
        //if (!configPowerInfo || !configPowerInfo.powerType.includes("attack")) return

        //let changes = {}
        //changes[`img`] = "icons/svg/sword.svg"


        // Name
        let description = this.system.ALIAS
        let name = this.system.NAME || description || configPowerInfo?.xmlid || this.system.name || this.name;
        this.name = name

        let levels = parseInt(this.system.value) || parseInt(this.system.DC) || 0;
        const input = this.system.INPUT

        const ocv = parseInt(this.system.OCV) || 0;
        const dcv = parseInt(this.system.DCV) || 0;

        // Check if this is a MARTIAL attack.  If so then EXTRA DC's may be present
        if (this.system.XMLID == "MANEUVER") {

            let EXTRADC = null;

            // HTH
            if (this.system.CATEGORY == "Hand To Hand") {
                EXTRADC = this.actor.items.find(o => o.system.XMLID == "EXTRADC" && o.system.ALIAS.indexOf("HTH") > -1)
            }
            // Ranged is not implemented yet

            // Extract +2 HTH Damage Class(es)
            if (EXTRADC) {
                let match = EXTRADC.system.ALIAS.match(/\+\d+/)
                if (match) {
                    levels += parseInt(match[0])
                }
            }
        }

        // Check if TELEKINESIS + WeaponElement (BAREHAND) + EXTRADC  (WillForce)
        if (this.system.XMLID == "TELEKINESIS") {
            if (this.actor.items.find(o => o.system.XMLID == "WEAPON_ELEMENT" && o.system.ADDER.find(o => o.XMLID == "BAREHAND"))) {
                let EXTRADC = item.actor.items.find(o => o.system.XMLID == "EXTRADC" && o.system.ALIAS.indexOf("HTH") > -1)
                // Extract +2 HTH Damage Class(es)
                if (EXTRADC) {
                    let match = EXTRADC.system.ALIAS.match(/\+\d+/)
                    if (match) {
                        levels += parseInt(match[0]) * 5 // Below we take these levels (as STR) and determine dice
                    }
                }
            }
        }


        // Active cost is required for endurance calculation.
        // It should include all advantages (which we don't handle very well at the moment)
        // However this should be calculated during power upload (not here)
        // let activeCost = (levels * 5)
        // let end = Math.round(activeCost / 10 - 0.01);
        //changes[`system.activeCost`] = activeCost

        this.system.subType = 'attack'
        this.system.class = input === "ED" ? "energy" : "physical"
        this.system.dice = levels
        this.system.extraDice = "zero"
        this.system.killing = false
        this.system.knockbackMultiplier = 1
        this.system.targets = "dcv"
        this.system.uses = "ocv"
        this.system.usesStrength = true
        this.system.areaOfEffect = { type: 'none', value: 0 }
        this.system.piercing = 0
        this.system.penetrating = 0
        this.system.ocv = ocv
        this.system.dcv = dcv
        this.system.stunBodyDamage = "stunbody"

        // BLOCK and DODGE typically do not use STR
        if (["maneuver", "martialart"].includes(this.type)) {
            if (this.system.EFFECT?.toLowerCase().indexOf("block") > -1 ||
                this.system.EFFECT?.toLowerCase().indexOf("dodge") > -1
            ) {
                this.system.usesStrength = false;
            }
        }

        // ENTANGLE (not implemented)
        if (xmlid == "ENTANGLE") {
            this.system.class = 'entangle'
            this.system.usesStrength = false
            this.system.noHitLocations = true
            this.system.knockbackMultiplier = 0
        }

        // DARKNESS (not implemented)
        if (xmlid == "DARKNESS") {
            this.system.class = 'darkness'
            this.system.usesStrength = false
            this.system.noHitLocations = true
        }

        // IMAGES (not implemented)
        if (xmlid == "IMAGES") {
            this.system.class = 'images'
            this.system.usesStrength = false
            this.system.noHitLocations = true
        }

        // DRAIN (not implemented)
        if (xmlid == "DRAIN") {
            this.system.class = 'drain'
            this.system.killing = true
            this.system.usesStrength = false
            this.system.noHitLocations = true
        }

        // AID (not implemented)
        if (xmlid == "AID") {
            this.system.class = 'aid'
            this.system.usesStrength = false
            this.system.noHitLocations = true
        }

        // TRANSFER
        if (xmlid == "TRANSFER") {
            this.system.class = 'transfer'
            this.system.usesStrength = false
            this.system.noHitLocations = true
        }

        // MINDSCAN
        if (xmlid == "MINDSCAN") {
            this.system.class = 'mindscan'
            this.system.usesStrength = false
            this.system.noHitLocations = true
        }

        // DISPEL
        if (xmlid == "DISPEL") {
            this.system.class = 'dispel'
            this.system.usesStrength = false
            this.system.noHitLocations = true
        }

        // MENTALBLAST
        if (xmlid == "EGOATTACK") {
            this.system.class = 'mental'
            this.system.targets = "dmcv"
            this.system.uses = "omcv"
            this.system.knockbackMultiplier = 0
            this.system.usesStrength = false
            this.system.stunBodyDamage = "stunonly"
            this.system.noHitLocations = true
        }

        // MINDCONTROL
        if (xmlid == "MINDCONTROL") {
            this.system.class = 'mindcontrol'
            this.system.targets = "dmcv"
            this.system.uses = "omcv"
            this.system.knockbackMultiplier = 0
            this.system.usesStrength = false
            this.system.stunBodyDamage = "stunonly"
            this.system.noHitLocations = true
        }

        // TELEPATHY
        if (xmlid == "TELEPATHY") {
            this.system.class = 'telepathy'
            this.system.targets = "dmcv"
            this.system.uses = "omcv"
            this.system.knockbackMultiplier = 0
            this.system.usesStrength = false
            //this.system.stunBodyDamage = "stunonly"
            this.system.noHitLocations = true
        }

        // CHANGEENVIRONMENT
        if (xmlid == "CHANGEENVIRONMENT") {
            this.system.class = 'change enviro'
            this.system.usesStrength = false
            this.system.noHitLocations = true
        }

        // FLASH
        if (xmlid == "FLASH") {
            this.system.class = 'flash'
            this.system.usesStrength = false
            this.system.noHitLocations = true
        }

        // AVAD
        const avad = this.findModsByXmlid("AVAD")
        if (avad) {
            this.system.class = 'avad'
        }


        // Armor Piercing
        let ARMORPIERCING = this.findModsByXmlid("ARMORPIERCING")
        if (ARMORPIERCING) {
            this.system.piercing = parseInt(ARMORPIERCING.LEVELS)
        }

        // Penetrating
        let PENETRATING = this.findModsByXmlid("PENETRATING")
        if (PENETRATING) {
            this.system.penetrating = parseInt(PENETRATING.LEVELS)
        }

        // No Knockback
        let NOKB = this.findModsByXmlid("NOKB")
        if (NOKB) {
            this.system.knockbackMultiplier = 0
        }

        // Double Knockback
        const DOUBLEKB = this.findModsByXmlid("DOUBLEKB")
        if (DOUBLEKB) {
            this.system.knockbackMultiplier = 2
        }

        // Explosion
        const EXPLOSION = this.findModsByXmlid("EXPLOSION")
        // if (EXPLOSION) {
        //     if (game.settings.get(game.system.id, 'alphaTesting')) {
        //         ui.notifications.warn(`EXPLOSION not implemented during HDC upload of ${this.actor.name}`)
        //     }
        // }

        // Alternate Combat Value (uses OMCV against DCV)
        let ACV = this.findModsByXmlid("ACV")
        if (ACV) {
            this.system.uses = (ACV.OPTION_ALIAS.match(/uses (\w+)/)?.[1] || this.system.uses).toLowerCase()
            this.system.targets = (ACV.OPTION_ALIAS.match(/against (\w+)/)?.[1] || this.system.targets).toLowerCase()
            // if (ACV.OPTION_ALIAS === "uses OMCV against DCV") {
            //     this.system.uses = 'omcv'
            //     this.system.targets = 'dcv'
            // }
            // if (ACV.OPTION_ALIAS === "uses OCV against DMCV") {
            //     this.system.uses = 'ocv'
            //     this.system.targets = 'dmcv'
            // }
            // if (ACV.OPTION_ALIAS === "uses OMCV against DCV") {
            //     this.system.uses = 'omcv'
            //     this.system.targets = 'dcv'
            // }
            // if (ACV.OPTION_ALIAS === "uses OMCV against DMCV") {
            //     this.system.uses = 'omcv'
            //     this.system.targets = 'dcv'
            // }
        }


        if (this.findModsByXmlid("PLUSONEPIP")) {
            this.system.extraDice = "pip"
        }

        if (this.findModsByXmlid("PLUSONEHALFDIE")) {
            this.system.extraDice = "half"
        }

        if (this.findModsByXmlid("MINUSONEPIP")) {
            // Typically only allowed for killing attacks.
            //  Appears that +1d6-1 is roughly equal to +1/2 d6
            this.system.extraDice = "half"
        }

        const aoe = this.findModsByXmlid("AOE")
        if (aoe) {
            this.system.areaOfEffect = {
                type: aoe.OPTION_ALIAS.toLowerCase(),
                value: parseInt(aoe.LEVELS)
            }
        }


        if (xmlid === "HKA" || this.system.EFFECT?.indexOf("KILLING") > -1) {
            this.system.killing = true

            // Killing Strike uses DC=2 which is +1/2d6.
            // For now just recalculate that, but ideally rework this function to use DC instead of dice.
            let pips = parseInt(this.system.DC || this.system.value * 3);
            //pips += Math.floor(this.system.characteristics.str.value / 5)
            this.system.dice = Math.floor(pips / 3);
            if (pips % 3 == 1) {
                this.system.extraDice = "pip"
            }
            if (pips % 3 == 2) {
                this.system.extraDice = "half"
            }

        }


        if (xmlid === "TELEKINESIS") {
            // levels is the equivalent strength
            this.system.extraDice = "zero"
            this.system.dice = 0
            this.system.extraDice = "zero";
            this.name = name + " (TK strike)"
            this.system.usesStrength = false
            this.system.usesTk = true
        }

        if (xmlid === "ENERGYBLAST") {
            this.system.usesStrength = false
        }

        if (xmlid === "RKA") {
            this.system.killing = true
            this.system.usesStrength = false
        }

        const noStrBonus = this.findModsByXmlid("NOSTRBONUS")
        if (noStrBonus) {
            this.system.usesStrength = false;
        }

        const stunOnly = this.findModsByXmlid("STUNONLY")
        if (stunOnly) {
            this.system.stunBodyDamage = "stunonly"
        }

        // if (item._id) {
        //     await item.update(changes, { hideChatMessage: true })
        // }


        // Possibly a QUENCH test
        // for (let change of Object.keys(changes).filter(o => o != "_id")) {
        //     let target = item;
        //     for (let key of change.split('.')) {
        //         if (typeof target[key] == 'object') {
        //             target = target[key]
        //         } else {
        //             target[key] = changes[change]
        //         }
        //     }
        // }

    }




}

export function getItem(id) {
    const gameItem = game.items.get(id)
    if (gameItem) { return gameItem; }

    for (const actor of game.actors) {
        const testItem = actor.items.get(id)
        if (testItem) {
            return testItem
        }
    }

    return null
}

export async function RequiresASkillRollCheck(item) {

    // Toggles don't need a roll to turn off
    if (item.system?.active === true) return true;


    let rar = (item.system.MODIFIER || []).find(o => o.XMLID === "REQUIRESASKILLROLL" || o.XMLID === "ACTIVATIONROLL");
    if (rar) {

        let rollEquation = "3d6";
        let roll = new Roll(rollEquation, item.getRollData());

        let result = await roll.evaluate({ async: true });

        let OPTION_ALIAS = rar.OPTION_ALIAS

        // Requires A Roll (generic) default to 11
        let value = parseInt(rar.OPTIONID)

        switch (rar.OPTIONID) {
            case "SKILL":
            case "SKILL1PER5":
            case "SKILL1PER20":
                OPTION_ALIAS = OPTION_ALIAS?.split(',')[0].replace(/roll/i, "").trim();
                let skill = item.actor.items.find(o => (o.system.subType || o.system.type) === 'skill' &&
                    (o.system.XMLID === OPTION_ALIAS.toUpperCase() || o.name.toUpperCase() === OPTION_ALIAS.toUpperCase())
                );
                if (!skill && rar.COMMENTS) {
                    skill = item.actor.items.find(o => (o.system.subType || o.system.type) === 'skill' &&
                        (o.system.XMLID === rar.COMMENTS.toUpperCase() || o.name.toUpperCase() === rar.COMMENTS.toUpperCase())
                    );
                    if (skill) {
                        OPTION_ALIAS = rar.COMMENTS;
                    }
                }
                if (!skill && rar.COMMENTS) {
                    let char = item.actor.system.characteristics[rar.COMMENTS.toLowerCase()];
                    if (char) {
                        ui.notifications.warn(`${item.name} incorrectly built.  Skill Roll for ${rar.COMMENTS} should be a Characteristic Roll.`);
                    }
                }
                if (skill) {
                    value = parseInt(skill.system.roll);
                    if (rar.OPTIONID === "SKILL1PER5") value = Math.max(3, value - Math.floor(parseInt(item.system.activePoints) / 5))
                    if (rar.OPTIONID === "SKILL1PER20") value = Math.max(3, value - Math.floor(parseInt(item.system.activePoints) / 20))

                    OPTION_ALIAS += ` ${value}-`;
                } else {
                    ui.notifications.warn(`Expecting 'SKILL roll', where SKILL is the name of an owned skill.`);
                }
                break;


            case "CHAR":
                OPTION_ALIAS = OPTION_ALIAS?.split(',')[0].replace(/roll/i, "").trim();
                let char = item.actor.system.characteristics[OPTION_ALIAS.toLowerCase()];
                if (!char && rar.COMMENTS) {
                    char = item.actor.system.characteristics[rar.COMMENTS.toLowerCase()];
                    if (char) {
                        OPTION_ALIAS = rar.COMMENTS;
                    }
                }
                if (char) {
                    item.actor.updateRollable(OPTION_ALIAS.toLowerCase())
                    value = parseInt(item.actor.system.characteristics[OPTION_ALIAS.toLowerCase()].roll);
                    OPTION_ALIAS += ` ${value}-`;
                } else {
                    ui.notifications.warn(`Expecting 'CHAR roll', where CHAR is the name of a characteristic.`);
                }
                break;



            default:
                if (!value) {
                    ui.notifications.warn(`${OPTION_ALIAS} is not supported.`);
                }
        }


        let margin = parseInt(value) - result.total;

        let flavor = item.name.toUpperCase() + " (" + OPTION_ALIAS + ") ";
        if (value > 0) {
            flavor += (margin >= 0 ? "succeeded" : "failed") + " by " + Math.abs(margin);
        }

        await result.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: item.actor }),
            flavor: flavor,
            borderColor: margin >= 0 ? 0x00FF00 : 0xFF0000,
        });

        if (margin < 0) {
            return false;
        }

    }
    return true;
}