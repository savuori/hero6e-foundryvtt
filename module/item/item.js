import { HeroSystem6eAttackCard } from "../card/attack-card.js";
import { HeroSystem6eCard } from "../card/card.js";
import { HEROSYS } from "../herosystem6e.js";
import * as Dice from "../dice.js"
import * as Attack from "../item/item-attack.js"
import { createSkillPopOutFromItem } from '../item/skill.js'
import { enforceManeuverLimits } from '../item/manuever.js'
import { SkillRollUpdateValue, updateItem, updateItemDescription } from '../utility/upload_hdc.js'
import { onActiveEffectToggle } from '../utility/effects.js'
import { getPowerInfo } from '../utility/util.js'

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

    // Largely used to determine if we can drag to hotbar
    isRollable() {
        switch (this.system?.subType || this.type) {
            case 'attack': return true
            case 'skill': return true
            case 'defense': return true
        }
        return false
    }

    async roll() {

        const success = await RequiresASkillRollCheck(this);
        if (!success) {
            return;
        }



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
                    case undefined:
                        return await Attack.AttackOptions(this)

                    default:
                        ui.notifications.warn(`${this.system.XMLID} roll is not fully supported`)
                        return await Attack.AttackOptions(this)
                }

            case "defense":
                return this.toggle()
            case "skill":
                SkillRollUpdateValue(this)
                return createSkillPopOutFromItem(this, this.actor)
            default: ui.notifications.warn(`${this.name} roll is not supported`)
        }

    }

    async chat() {

        updateItemDescription(this);

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
        if (this.system.description && this.system.description != this.name) {
            content += ` ${this.system.description}`
        }
        // if (this.system.roll) {
        //     content += ` (${this.system.roll})`
        // }
        content += "."

        if (this.system.end) {
            content += ` Estimated End: ${this.system.end}.`
        }
        if (this.system.realCost) {
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

            const costEndOnlyToActivate = item.system.modifiers.find(o => o.XMLID === "COSTSEND" && o.OPTION === "ACTIVATE");
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
                // TODO: Remove duplicate defense items and make them ActiveEffects
                await item.update({ [attr]: newValue })
                break;

            case "power":

                // Is this a defense power?  If so toggle active state
                const configPowerInfo = getPowerInfo({ item: item })
                if (configPowerInfo && configPowerInfo.powerType.includes("defense")) {
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
            case "equipment":
                await item.update({ [attr]: newValue })
                // Do nothing special for now.
                // Weight/encumbrance will automtically be calculated.
                // TODO: tie defensive/buff items into equipment.
                break;
            case "talent": // COMBAT_LUCK
                await item.update({ [attr]: newValue })
                break;
            default: ui.notifications.warn(`${this.name} toggle may be incompmlete`)
        }
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

// async function updateCombatAutoMod(actor, item) {
//     const changes = {}

//     let ocvEq = 0
//     let dcvEq = '+0'

//     function dcvEquation(dcvEq, newDcv) {
//         if (dcvEq.includes('/') && !newDcv.includes('/')) {
//             // don't modify dcvEq
//         } else if (!dcvEq.includes('/') && newDcv.includes('/')) {
//             dcvEq = newDcv
//         } else if (parseFloat(dcvEq) <= parseFloat(newDcv)) {
//             dcvEq = newDcv
//         } else {
//             dcvEq = Math.round(parseFloat(dcvEq) + parseFloat(newDcv)).toString()
//         }

//         return dcvEq
//     }

//     for (const i of actor.items) {
//         if (i.system.active && i.type === 'maneuver') {
//             ocvEq = ocvEq + parseInt(i.system.ocv)

//             dcvEq = dcvEquation(dcvEq, i.system.dcv)
//         }

//         if ((i.type === 'power' || i.type === 'equipment') && ("items" in i.system) && ('maneuver' in i.system.items)) {
//             for (const [key, value] of Object.entries(i.system.items.maneuver)) {
//                 if (value.type && value.visible && value.active) {
//                     ocvEq = ocvEq + parseInt(value.ocv)

//                     dcvEq = dcvEquation(dcvEq, value.dcv)
//                 }
//             }
//         }
//     }

//     if (isNaN(ocvEq)) {
//         ocvEq = item.system.ocv
//     } else if (ocvEq >= 0) {
//         ocvEq = '+' + ocvEq.toString()
//     } else {
//         ocvEq = ocvEq.toString()
//     }

//     changes['system.characteristics.ocv.autoMod'] = ocvEq
//     changes['system.characteristics.omcv.autoMod'] = ocvEq;
//     changes['system.characteristics.dcv.autoMod'] = dcvEq
//     changes['system.characteristics.dmcv.autoMod'] = dcvEq;

//     changes['system.characteristics.ocv.value'] = actor.system.characteristics.ocv.max + parseInt(ocvEq)
//     changes['system.characteristics.omcv.value'] = actor.system.characteristics.omcv.max + parseInt(ocvEq);

//     if (dcvEq.includes('/')) {
//         changes['system.characteristics.dcv.value'] = Math.round(actor.system.characteristics.dcv.max * (parseFloat(dcvEq.split('/')[0]) / parseFloat(dcvEq.split('/')[1])))
//         changes['system.characteristics.dmcv.value'] = Math.round(actor.system.characteristics.dmcv.max * (parseFloat(dcvEq.split("/")[0]) / parseFloat(dcvEq.split("/")[1])));
//     } else {
//         changes['system.characteristics.dcv.value'] = actor.system.characteristics.dcv.max + parseInt(dcvEq)
//         changes['system.characteristics.dmcv.value'] = actor.system.characteristics.dmcv.max + parseInt(dcvEq);
//     }

//     await actor.update(changes)


// }

async function RequiresASkillRollCheck(item) {
    let rar = item.system.modifiers.find(o => o.XMLID === "REQUIRESASKILLROLL" || o.XMLID === "ACTIVATIONROLL");
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
                let skill = item.actor.items.find(o => o.system.XMLID === OPTION_ALIAS.toUpperCase() || o.name.toUpperCase() === OPTION_ALIAS.toUpperCase());
                if (!skill && rar.COMMENTS) {
                    skill = item.actor.items.find(o => o.system.XMLID === rar.COMMENTS.toUpperCase() || o.name.toUpperCase() === rar.COMMENTS.toUpperCase());
                    if (skill) {
                        OPTION_ALIAS = rar.COMMENTS;
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

        result.toMessage({
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