import { HeroSystem6eActorActiveEffects } from "./actor-active-effects.js";
import { HeroSystem6eItem } from "../item/item.js";
import { HEROSYS } from "../herosystem6e.js";
import {
    getPowerInfo,
    getCharacteristicInfoArrayForActor,
} from "../utility/util.js";

/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class HeroSystem6eActor extends Actor {
    /** @inheritdoc */
    async _preCreate(data, options, user) {
        await super._preCreate(data, options, user);

        //TODO: Add user configuration for initial prototype settings

        HEROSYS.log(false, "_preCreate");
        let prototypeToken = {
            // Leaving sight disabled.
            // TODO: Implement various Enhanced Visions
            // sight: { enabled: true },
            displayBars: CONST.TOKEN_DISPLAY_MODES.HOVER,
            displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
        };

        if (this.type != "npc") {
            prototypeToken = {
                ...prototypeToken,
                actorLink: true,
                disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
                displayBars: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
                displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
            };
        }

        this.updateSource({ prototypeToken });
    }

    async removeActiveEffect(activeEffect) {
        const existingEffect = Array.from(this.allApplicableEffects()).find(
            (o) => o.id === activeEffect.id,
        );
        if (existingEffect) {
            if (activeEffect.id == "knockedOut") {
                // When they wakes up, their END equals their
                // current STUN total.
                let newEnd = Math.min(
                    parseInt(this.system.characteristics.stun.value),
                    parseInt(this.system.characteristics.end.max),
                );
                await this.update({
                    "system.characteristics.end.value": newEnd,
                });
            }

            await existingEffect.delete();
        }
    }

    // Adding ActiveEffects seems complicated.
    // Make sure only one of the same ActiveEffect is added
    // Assumes ActiveEffect is a statusEffects.
    // TODO: Allow for a non-statusEffects ActiveEffect (like from a power)
    async addActiveEffect(activeEffect) {
        const newEffect = foundry.utils.deepClone(activeEffect);

        // Check for standard StatusEffects
        // statuses appears to be necessary to associate with StatusEffects
        if (activeEffect.id) {
            newEffect.statuses = [activeEffect.id];

            // Check if this ActiveEffect already exists
            const existingEffect = this.effects.find((o) =>
                o.statuses.has(activeEffect.id),
            );
            if (!existingEffect) {
                await this.createEmbeddedDocuments("ActiveEffect", [newEffect]);
            }
        }

        if (activeEffect.id == "knockedOut") {
            // Knocked Out overrides Stunned
            await this.removeActiveEffect(
                HeroSystem6eActorActiveEffects.stunEffect,
            );
        }
    }

    async ChangeType() {
        const template =
            "systems/hero6efoundryvttv2/templates/chat/actor-change-type-dialog.hbs";
        const actor = this;
        let cardData = {
            actor,
            groupName: "typeChoice",
            choices: Actor.TYPES.filter(
                (o) => o != "character" && o != "base",
            ).reduce((a, v) => ({ ...a, [v]: v.replace("2", "") }), {}), // base is internal type and/or keyword. BASE2 is for bases.
            chosen: actor.type,
        };
        const html = await renderTemplate(template, cardData);
        return new Promise((resolve) => {
            const data = {
                title: `Change ${this.name} Type`,
                content: html,
                buttons: {
                    normal: {
                        label: "Apply",
                        callback: (html) => resolve(_processChangeType(html)),
                    },
                },
                default: "normal",
                close: () => resolve({ cancelled: true }),
            };
            new Dialog(data, null).render(true);

            async function _processChangeType(html) {
                await actor.update({
                    type: html.find("input:checked")[0].value,
                });
            }
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle how changes to a Token attribute bar are applied to the Actor.
     * This allows for game systems to override this behavior and deploy special logic.
     * @param {string} attribute    The attribute path
     * @param {number} value        The target attribute value
     * @param {boolean} isDelta     Whether the number represents a relative change (true) or an absolute change (false)
     * @param {boolean} isBar       Whether the new value is part of an attribute bar, or just a direct value
     * @returns {Promise<documents.Actor>}  The updated Actor document
     */
    async modifyTokenAttribute(
        attribute,
        value,
        isDelta = false,
        isBar = true,
    ) {
        const current = foundry.utils.getProperty(this.system, attribute);

        // Determine the updates to make to the actor data
        let updates;
        if (isBar) {
            if (isDelta)
                value = Math.clamped(
                    -99,
                    Number(current.value) + value,
                    current.max,
                ); // a negative bar is typically acceptable
            updates = { [`system.${attribute}.value`]: value };
        } else {
            if (isDelta) value = Number(current) + value;
            updates = { [`system.${attribute}`]: value };
        }
        const allowed = Hooks.call(
            "modifyTokenAttribute",
            { attribute, value, isDelta, isBar },
            updates,
        );
        return allowed !== false ? this.update(updates) : this;
    }

    async _preUpdate(changed, options, userId) {
        await super._preUpdate(changed, options, userId);

        // Forward changed date to _onUpdate.
        // _preUpdate only seems to run for GM or one user which
        // results in _displayScrollingChange only showing for those users.
        // Where as _onUpdate runs for all users.
        options.displayScrollingChanges = [];

        let content = "";

        if (changed?.system?.characteristics?.stun?.value) {
            let valueT = parseInt(this.system.characteristics.stun.value);
            let valueC = parseInt(changed.system.characteristics.stun.value);
            let valueM = parseInt(this.system.characteristics.stun.max);
            if (valueT != valueC) {
                content = `STUN from ${valueT} to ${valueC}`;
            } else {
                content = `STUN changed to ${valueC}`;
            }
            if (valueC === valueM) {
                content += " (at max)";
            }

            //this._displayScrollingChange(valueC - valueT, { max: valueM, fill: '0x00FF00' });
            options.displayScrollingChanges.push({
                value: valueC - valueT,
                options: { max: valueM, fill: "0x00FF00" },
            });
        }

        if (changed?.system?.characteristics?.body?.value) {
            let valueT = parseInt(this.system.characteristics.body.value);
            let valueC = parseInt(changed.system.characteristics.body.value);
            let valueM = parseInt(this.system.characteristics.body.max);
            if (valueT != valueC) {
                content = `BODY from ${valueT} to ${valueC}`;
            } else {
                content = `BODY changed to ${valueC}`;
            }
            if (valueC === valueM) {
                content += " (at max)";
            }

            options.displayScrollingChanges.push({
                value: valueC - valueT,
                options: { max: valueM, fill: "0xFF1111" },
            });
        }

        if (options.hideChatMessage || !options.render) return;

        if (content) {
            const chatData = {
                user: game.user.id,
                whisper: ChatMessage.getWhisperRecipients("GM"),
                speaker: ChatMessage.getSpeaker({ actor: this }),
                blind: true,
                content: content,
            };
            await ChatMessage.create(chatData);
        }
    }

    async _onUpdate(data, options, userId) {
        super._onUpdate(data, options, userId);

        // If stun was changed and running under triggering users context
        if (data?.system?.characteristics?.stun && userId === game.user.id) {
            if (data.system.characteristics.stun.value <= 0) {
                this.addActiveEffect(
                    HeroSystem6eActorActiveEffects.knockedOutEffect,
                );
            }

            // Mark as defeated in combat tracker
            if (
                data.type != "pc" &&
                data.system.characteristics.stun.value < -10
            ) {
                const combatant = game.combat?.combatants.find(
                    (o) => o.actorId === data._id,
                );
                if (combatant && !combatant.defeated) {
                    combatant.update({ defeated: true });
                }
            }

            // Mark as undefeated in combat tracker
            if (
                data.type != "pc" &&
                data.system.characteristics.stun.value > -10
            ) {
                let combatant = game.combat?.combatants?.find(
                    (o) => o.actorId === data._id,
                );
                if (combatant && combatant.defeated) {
                    combatant.update({ defeated: false });
                }
            }

            if (data.system.characteristics.stun.value > 0) {
                this.removeActiveEffect(
                    HeroSystem6eActorActiveEffects.knockedOutEffect,
                );
            }
        }

        // If STR was change check encumbrance
        if (data?.system?.characteristics?.str && userId === game.user.id) {
            this.applyEncumbrancePenalty();
        }

        // Display changes from _preUpdate
        for (let d of options.displayScrollingChanges) {
            this._displayScrollingChange(d.value, d.options);
        }
    }

    async TakeRecovery(asAction) {
        // RECOVERING
        // Characters use REC to regain lost STUN and expended END.
        // This is known as “Recovering” or “taking a Recovery.”
        // When a character Recovers, add their REC to their current
        // STUN and END totals (to a maximum of their full values, of
        // course). Characters get to Recover in two situations: Post-
        // Segment and when they choose to Recover as a Full Phase
        // Action.

        // RECOVERING AS AN ACTION
        // Recovering is a Full Phase Action and occurs at the end of
        // the Segment (after all other characters who have a Phase that
        // Segment have acted). A character who Recovers during a Phase
        // may do nothing else. They cannot even maintain a Constant Power
        // or perform Actions that cost no END or take no time. However,
        // they may take Zero Phase Actions at the beginning of their Phase
        // to turn off Powers, and Persistent Powers that don’t cost END
        // remain in effect.

        let token = this.token;
        let speaker = ChatMessage.getSpeaker({ actor: this, token });
        speaker["alias"] = this.name;

        // A character who holds their breath does not get to Recover (even
        // on Post-Segment 12)
        if (this.statuses.has("holdingBreath")) {
            const content = this.name + " <i>is holding their breath</i>.";
            if (asAction) {
                const chatData = {
                    user: game.user._id,
                    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
                    content: content,
                    speaker: speaker,
                };
                await ChatMessage.create(chatData);
            }
            return content;
        }

        const chars = this.system.characteristics;

        // Shouldn't happen, but you never know
        if (isNaN(parseInt(chars.stun.value))) {
            chars.stun.value = 0;
        }
        if (isNaN(parseInt(chars.end.value))) {
            chars.end.value = 0;
        }

        let newStun = parseInt(chars.stun.value) + parseInt(chars.rec.value);
        let newEnd = parseInt(chars.end.value) + parseInt(chars.rec.value);

        if (newStun > chars.stun.max) {
            newStun = Math.max(chars.stun.max, parseInt(chars.stun.value)); // possible > MAX (which is OKish)
        }
        let deltaStun = newStun - parseInt(chars.stun.value);

        if (newEnd > chars.end.max) {
            newEnd = Math.max(chars.end.max, parseInt(chars.end.value)); // possible > MAX (which is OKish)
        }
        let deltaEnd = newEnd - parseInt(chars.end.value);

        await this.update(
            {
                "system.characteristics.stun.value": newStun,
                "system.characteristics.end.value": newEnd,
            },
            { hideChatMessage: true },
        );

        let content = this.name + ` <i>Takes a Recovery</i>`;
        if (deltaEnd || deltaStun) {
            content += `, gaining ${deltaEnd} endurance and ${deltaStun} stun.`;
        } else {
            content += ".";
        }

        // Endurance Reserve Recovery
        if (!asAction) {
            const enduranceReserve = this.items.find(
                (o) => o.system.XMLID === "ENDURANCERESERVE",
            );
            if (enduranceReserve) {
                let erValue = parseInt(enduranceReserve.system.value);
                let erMax = parseInt(enduranceReserve.system.max);
                if (enduranceReserve.system.powers) {
                    const power = enduranceReserve.system.powers.find(
                        (o) => o.XMLID === "ENDURANCERESERVEREC",
                    );
                    if (power) {
                        let erRec = parseInt(power.LEVELS);
                        let deltaEndReserve = Math.min(erRec, erMax - erValue);
                        if (deltaEndReserve) {
                            erValue += deltaEndReserve;
                            enduranceReserve.system.LEVELS.value = erValue;
                            enduranceReserve.updateItemDescription();
                            await enduranceReserve.update({
                                "system.LEVELS": enduranceReserve.system.LEVELS,
                                "system.description":
                                    enduranceReserve.system.description,
                            });
                            content += ` ${enduranceReserve.name} +${deltaEndReserve} END.`;
                        }
                    }
                }
            }
        }

        const chatData = {
            user: game.user._id,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            content: content,
            speaker: speaker,
        };

        if (asAction) {
            await ChatMessage.create(chatData);

            // Remove stunned condition.
            // While not technically part of the rules, it is here as a convenience.
            // For example when Combat Tracker isn't being used.
            await this.removeActiveEffect(
                HeroSystem6eActorActiveEffects.stunEffect,
            );
        }

        return content;
    }

    // When stunned, knockedout, etc you cannot act
    canAct(uiNotice) {
        if (this.statuses.has("knockedOut")) {
            if (uiNotice)
                ui.notifications.error(
                    `${this.name} is KNOCKED OUT and cannot act.`,
                );
            return false;
        }

        if (this.statuses.has("stunned")) {
            if (uiNotice)
                ui.notifications.error(
                    `${this.name} is STUNNED and cannot act.`,
                );
            return false;
        }

        if (this.statuses.has("aborted")) {
            if (uiNotice)
                ui.notifications.error(
                    `${this.name} has ABORTED and cannot act.`,
                );
            return false;
        }

        // A character
        // who is Stunned or recovering from being
        // Stunned can take no Actions, take no Recoveries
        // (except their free Post-Segment 12 Recovery), cannot
        // move, and cannot be affected by Presence Attacks.

        // Recovering from being Stunned requires a Full
        // Phase, and is the only thing the character can do
        // during that Phase.

        if (this.statuses.has("stunned")) {
            if (uiNotice)
                ui.notifications.error(
                    `${this.name} is STUNNED and cannot act.`,
                );
            return false;
        }
        return true;
    }

    /**
     * Display changes to health as scrolling combat text.
     * Adapt the font size relative to the Actor's HP total to emphasize more significant blows.
     * @param {*} change
     * @param {*} options
     */
    _displayScrollingChange(change, options) {
        if (!change) return;
        const tokens = this.getActiveTokens();
        if (!tokens) return;
        const token = tokens[0];
        if (!token) return;
        options = options || {};

        let fontSize = 50;
        if (options.max) {
            fontSize += Math.floor((Math.abs(change) / options.max) * fontSize);
        }

        canvas.interface.createScrollingText(
            token.center,
            change.signedString(),
            {
                anchor:
                    change < 0
                        ? CONST.TEXT_ANCHOR_POINTS.BOTTOM
                        : CONST.TEXT_ANCHOR_POINTS.TOP,
                direction: change < 0 ? 1 : 2,
                fontSize: Math.clamped(fontSize, 50, 100),
                fill: options?.fill || "0xFFFFFF",
                stroke: options?.stroke || 0x00000000,
                strokeThickness: 4,
                jitter: 0.25,
            },
        );
    }

    strDetails() {
        let strLiftText = "0";
        let strThrow = 0;
        let value = this.system.characteristics.str.value;
        if (value >= 1) {
            strLiftText = "8kg";
            strThrow = 2;
        }
        if (value >= 2) {
            strLiftText = "16kg";
            strThrow = 3;
        }
        if (value >= 3) {
            strLiftText = "25kg";
            strThrow = 4;
        }
        if (value >= 4) {
            strLiftText = "38kg";
            strThrow = 6;
        }
        if (value >= 5) {
            strLiftText = "50kg";
            strThrow = 8;
        }
        if (value >= 8) {
            strLiftText = "75kg";
            strThrow = 12;
        }
        if (value >= 10) {
            strLiftText = "16kg";
            strThrow = 16;
        }
        if (value >= 13) {
            strLiftText = "150kg";
            strThrow = 20;
        }
        if (value >= 15) {
            strLiftText = "200kg";
            strThrow = 24;
        }
        if (value >= 18) {
            strLiftText = "300kg";
            strThrow = 28;
        }
        if (value >= 20) {
            strLiftText = "400kg";
            strThrow = 32;
        }
        if (value >= 23) {
            strLiftText = "600kg";
            strThrow = 36;
        }
        if (value >= 25) {
            strLiftText = "800kg";
            strThrow = 40;
        }
        if (value >= 28) {
            strLiftText = "1,200kg";
            strThrow = 44;
        }
        if (value >= 30) {
            strLiftText = "1,600kg";
            strThrow = 48;
        }
        if (value >= 35) {
            strLiftText = "3,200kg";
            strThrow = 56;
        }
        if (value >= 40) {
            strLiftText = "6,400kg";
            strThrow = 64;
        }
        if (value >= 45) {
            strLiftText = "12.5 tons";
            strThrow = 72;
        }
        if (value >= 50) {
            strLiftText = "25 tons";
            strThrow = 80;
        }
        if (value >= 55) {
            strLiftText = "50 tons";
            strThrow = 88;
        }
        if (value >= 60) {
            strLiftText = "100 tons";
            strThrow = 96;
        }
        if (value >= 65) {
            strLiftText = "200 tons";
            strThrow = 104;
        }
        if (value >= 70) {
            strLiftText = "400 tons";
            strThrow = 112;
        }
        if (value >= 75) {
            strLiftText = "800 tons";
            strThrow = 120;
        }
        if (value >= 80) {
            strLiftText = "1.6 ktons";
            strThrow = 128;
        }
        if (value >= 85) {
            strLiftText = "3.2 ktons";
            strThrow = 136;
        }
        if (value >= 90) {
            strLiftText = "6.4 ktons";
            strThrow = 144;
        }
        if (value >= 95) {
            strLiftText = "12.5 ktons";
            strThrow = 152;
        }
        if (value >= 100) {
            strLiftText = "25 ktons";
            strThrow = 160;
        }
        if (value >= 105) {
            strLiftText = `${50 + Math.floor((value - 105) / 5) * 25} ktons`;
            strThrow = 168 + Math.floor((value - 105) / 5) * 8;
        }

        // Get numeric strLiftKg
        let m = strLiftText.replace(",", "").match(/(\d+)kg/);
        let strLiftKg = m ? m[1] : 0;

        m = strLiftText.replace(",", "").match(/(\d+) tons/);
        strLiftKg = m ? m[1] * 1000 : strLiftKg;

        m = strLiftText.replace(",", "").match(/(\d+) ktons/);
        strLiftKg = m ? m[1] * 1000 * 1000 : strLiftKg;

        return { strLiftText, strThrow, strLiftKg };
    }

    async applyEncumbrancePenalty() {
        // Encumbrance (requires permissions to mess with ActiveEffects)
        if (game.user.isGM) {
            const { strLiftKg } = this.strDetails();
            let encumbrance = 0;
            const itemsWithWeight = this.items.filter(
                (o) => o.system.WEIGHT && o.system.active,
            );
            for (const item of itemsWithWeight) {
                encumbrance += parseFloat(item.system.WEIGHT);
            }

            // encumbrancePercentage
            const equipmentWeightPercentage =
                parseInt(
                    game.settings.get(
                        game.system.id,
                        "equipmentWeightPercentage",
                    ),
                ) / 100.0;
            encumbrance *= equipmentWeightPercentage;

            // Is actor encumbered?
            let dcvDex = 0;
            let move = 0;
            if (encumbrance / strLiftKg >= 0.1) {
                dcvDex = -1;
            }
            if (encumbrance / strLiftKg >= 0.25) {
                dcvDex = -2;
                move = -2;
            }
            if (encumbrance / strLiftKg >= 0.5) {
                dcvDex = -3;
                move = -4;
            }
            if (encumbrance / strLiftKg >= 0.75) {
                dcvDex = -4;
                move = -8;
            }
            if (encumbrance / strLiftKg >= 0.9) {
                dcvDex = -5;
                move = -16;
            }

            const name = `Encumbered ${Math.floor(
                (encumbrance / strLiftKg) * 100,
            )}%`;
            let prevActiveEffect = this.effects.find(
                (o) => o.flags?.encumbrance,
            );
            if (dcvDex < 0 && prevActiveEffect?.flags?.dcvDex != dcvDex) {
                let activeEffect = {
                    name: name,
                    id: "encumbered",
                    //icon: 'icons/svg/daze.svg', //'systems/hero6efoundryvttv2/icons/encumbered.svg',
                    icon: "systems/hero6efoundryvttv2/icons/encumbered.svg",
                    changes: [
                        {
                            key: "system.characteristics.dcv.value",
                            value: dcvDex,
                            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                        },
                        {
                            key: "system.characteristics.dex.value",
                            value: dcvDex,
                            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                        },
                        {
                            key: "system.characteristics.running.value",
                            value: move,
                            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                        },
                        {
                            key: "system.characteristics.swimming.value",
                            value: move,
                            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                        },
                        {
                            key: "system.characteristics.leaping.value",
                            value: move,
                            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                        },
                        {
                            key: "system.characteristics.flight.value",
                            value: move,
                            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                        },
                        {
                            key: "system.characteristics.swinging.value",
                            value: move,
                            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                        },
                        {
                            key: "system.characteristics.teleportation.value",
                            value: move,
                            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                        },
                        {
                            key: "system.characteristics.tunneling.value",
                            value: move,
                            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                        },
                    ],
                    origin: this.uuid,
                    duration: {
                        seconds: 3.154e7 * 100, // 100 years should be close to infinity
                    },
                    flags: {
                        dcvDex: dcvDex,
                        // temporary: true,
                        encumbrance: true,
                    },
                };

                if (prevActiveEffect) {
                    await prevActiveEffect.delete();
                    prevActiveEffect = null;
                }

                await this.createEmbeddedDocuments("ActiveEffect", [
                    activeEffect,
                ]);
            }

            if (dcvDex === 0 && prevActiveEffect) {
                await prevActiveEffect.delete();
            } else if (prevActiveEffect && prevActiveEffect.name != name) {
                await prevActiveEffect.update({ name: name });
            }
        }
    }

    async FullHealth() {
        // Remove all status effects
        for (let status of this.statuses) {
            let ae = Array.from(this.effects).find((effect) =>
                effect.statuses.has(status),
            );
            await ae.delete();
        }

        // Remove temporary effects
        const tempEffects = Array.from(this.effects).filter(
            (effect) => parseInt(effect.duration?.seconds || 0) > 0,
        );
        for (const ae of tempEffects) {
            await ae.delete();
        }

        // Set Characteristics VALUE to MAX
        const characteristicChanges = {};
        for (const char of Object.keys(this.system.characteristics)) {
            const value = parseInt(this.system.characteristics[char].value);
            const max = parseInt(this.system.characteristics[char].max);
            if (value != max) {
                characteristicChanges[`system.characteristics.${char}.value`] =
                    max;
            }
        }
        if (Object.keys(characteristicChanges).length > 0) {
            await this.update(characteristicChanges);
        }

        // Reset all items
        for (const item of this.items) {
            await item.resetToOriginal();
        }

        // We just cleared encumbrance, check if it applies again
        this.applyEncumbrancePenalty();
    }

    // Raw base is insufficient for 5e characters
    getCharacteristicBase(key) {
        let powerInfo = getPowerInfo({ xmlid: key.toUpperCase(), actor: this });

        let base = parseInt(powerInfo?.base) || 0;

        if (!this.system.is5e) return base;

        const _str = this.appliedEffects
            .filter(
                (o) =>
                    o.parent instanceof HeroSystem6eItem &&
                    !["DENSITYINCREASE", "GROWTH"].includes(
                        o.parent.system.XMLID,
                    ) &&
                    !o.parent.findModsByXmlid("NOFIGURED"),
            )
            .reduce(
                (partialSum, a) =>
                    partialSum +
                    parseInt(
                        a.changes.find(
                            (o) => o.key === "system.characteristics.str.max",
                        )?.value || 0,
                    ),
                0,
            );
        const _con = this.appliedEffects
            .filter(
                (o) =>
                    o.parent instanceof HeroSystem6eItem &&
                    !["DENSITYINCREASE", "GROWTH"].includes(
                        o.parent.system.XMLID,
                    ) &&
                    !o.parent.findModsByXmlid("NOFIGURED"),
            )
            .reduce(
                (partialSum, a) =>
                    partialSum +
                    parseInt(
                        a.changes.find(
                            (o) => o.key === "system.characteristics.con.max",
                        )?.value || 0,
                    ),
                0,
            );
        const _dex = this.appliedEffects
            .filter(
                (o) =>
                    o.parent instanceof HeroSystem6eItem &&
                    !["DENSITYINCREASE", "GROWTH"].includes(
                        o.parent.system.XMLID,
                    ) &&
                    !o.parent.findModsByXmlid("NOFIGURED"),
            )
            .reduce(
                (partialSum, a) =>
                    partialSum +
                    parseInt(
                        a.changes.find(
                            (o) => o.key === "system.characteristics.dex.max",
                        )?.value || 0,
                    ),
                0,
            );
        const _body = this.appliedEffects
            .filter(
                (o) =>
                    o.parent instanceof HeroSystem6eItem &&
                    !["DENSITYINCREASE", "GROWTH"].includes(
                        o.parent.system.XMLID,
                    ) &&
                    !o.parent.findModsByXmlid("NOFIGURED"),
            )
            .reduce(
                (partialSum, a) =>
                    partialSum +
                    parseInt(
                        a.changes.find(
                            (o) => o.key === "system.characteristics.body.max",
                        )?.value || 0,
                    ),
                0,
            );
        const _ego = this.appliedEffects
            .filter(
                (o) =>
                    o.parent instanceof HeroSystem6eItem &&
                    !["DENSITYINCREASE", "GROWTH"].includes(
                        o.parent.system.XMLID,
                    ) &&
                    !o.parent.findModsByXmlid("NOFIGURED"),
            )
            .reduce(
                (partialSum, a) =>
                    partialSum +
                    parseInt(
                        a.changes.find(
                            (o) => o.key === "system.characteristics.ego.max",
                        )?.value || 0,
                    ),
                0,
            );

        // TODO: FIXME: This is, but should never be, called with this.system[characteristic] being undefined. Need to reorder the loading
        //        mechanism to ensure that we do something more similar to a load, transform, and extract pipeline so that we
        //        not invoked way too many times and way too early.
        const charBase = (characteristicUpperCase) => {
            return (
                parseInt(this.system[characteristicUpperCase]?.LEVELS) +
                (parseInt(
                    getPowerInfo({
                        xmlid: characteristicUpperCase,
                        actor: this,
                    })?.base,
                ) || 0)
            );
        };

        switch (key.toLowerCase()) {
            // Physical Defense (PD) STR/5
            case "pd":
                return base + Math.round((charBase("STR") + _str) / 5);

            // Energy Defense (ED) CON/5
            case "ed":
                return base + Math.round((charBase("CON") + _con) / 5);

            // Speed (SPD) 1 + (DEX/10)   can be fractional
            case "spd":
                return (
                    base +
                    1 +
                    parseFloat(
                        parseFloat((charBase("DEX") + _dex) / 10).toFixed(1),
                    )
                );

            // Recovery (REC) (STR/5) + (CON/5)
            case "rec":
                return (
                    base +
                    Math.round((charBase("STR") + _str) / 5) +
                    Math.round((charBase("CON") + _con) / 5)
                );

            // Endurance (END) 2 x CON
            case "end":
                return base + Math.round((charBase("CON") + _con) * 2);

            // Stun (STUN) BODY+(STR/2)+(CON/2)
            case "stun":
                return (
                    base +
                    Math.round(charBase("BODY") + _body) +
                    Math.round((charBase("STR") + _str) / 2) +
                    Math.round((charBase("CON") + _con) / 2)
                );

            // Base OCV & DCV = Attacker’s DEX/3
            case "ocv":
            case "dcv":
                return Math.round((charBase("DEX") + _dex) / 3);

            //Base Ego Combat Value = EGO/3
            case "omcv":
            case "dmcv":
                return Math.round((charBase("EGO") + _ego) / 3);

            case "leaping": {
                const str = parseInt(charBase("STR") + _str);
                let value = 0;

                if (str >= 3) value = 0.5;
                if (str >= 5) value = 1;
                if (str >= 8) value = 1.5;
                if (str >= 10) value = 2;
                if (str >= 13) value = 2.5;
                if (str >= 15) value = 3;
                if (str >= 18) value = 3.5;
                if (str >= 20) value = 4;
                if (str >= 23) value = 4.5;
                if (str >= 25) value = 5;
                if (str >= 28) value = 5.5;
                if (str >= 30) value = 6;
                if (str >= 35) value = 7;
                if (str >= 40) value = 8;
                if (str >= 45) value = 9;
                if (str >= 50) value = 10;
                if (str >= 55) value = 11;
                if (str >= 60) value = 12;
                if (str >= 65) value = 13;
                if (str >= 70) value = 14;
                if (str >= 75) value = 15;
                if (str >= 80) value = 16;
                if (str >= 85) value = 17;
                if (str >= 90) value = 18;
                if (str >= 95) value = 19;
                if (str >= 100) value = 20 + Math.floor((str - 100) / 5);

                return value;
            }
        }

        return base;
    }

    async calcCharacteristicsCost() {
        let powers = getCharacteristicInfoArrayForActor(this);

        let changes = {};
        for (const powerInfo of powers) {
            let key = powerInfo.key.toLowerCase();
            let characteristic = this.system.characteristics[key];
            let core = parseInt(characteristic?.core) || 0;

            let base = this.getCharacteristicBase(key);
            let levels = core - base;
            let cost = Math.round(levels * (powerInfo.cost || 0));

            // 5e hack for fractional speed
            if (key === "spd" && cost < 0) {
                cost = Math.ceil(cost / 10);
            }

            if (characteristic.realCost != cost) {
                changes[`system.characteristics.${key}.realCost`] = cost;
                this.system.characteristics[key].realCost = cost;
            }
            // changes[`system.characteristics.${key}.basePointsPlusAdders`] = cost
            // changes[`system.characteristics.${key}.realCost`] = cost
            // changes[`system.characteristics.${key}.activePoints`] = cost
        }
        if (Object.keys(changes).length > 0 && this.id) {
            await this.update(changes);
        }
        return;
    }

    getActiveConstantItems() {
        let results = [];
        for (let item of this.items.filter((o) => o.system.active)) {
            let duration = getPowerInfo({
                xmlid: item.system.XMLID,
                actor: this,
            })?.duration;
            if (duration === "constant") {
                results.push(item);
            } else {
                const NONPERSISTENT = (item.system.modifiers || []).find(
                    (o) => o.XMLID === "NONPERSISTENT",
                );
                if (NONPERSISTENT) {
                    results.push(item);
                }
            }
        }
        return results;
    }

    getConstantEffects() {
        return Array.from(this.allApplicableEffects())
            .filter(
                (o) =>
                    !o.duration.duration &&
                    o.statuses.size === 0 &&
                    (!o.flags?.XMLID ||
                        getPowerInfo({
                            xmlid: o.flags?.XMLID,
                            actor: this,
                        })?.duration != "persistent"),
            )
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    getPersistentEffects() {
        return Array.from(this.allApplicableEffects())
            .filter(
                (o) =>
                    !o.duration.duration &&
                    o.statuses.size === 0 &&
                    o.flags?.XMLID &&
                    getPowerInfo({ xmlid: o.flags?.XMLID, actor: this })
                        ?.duration === "persistent",
            )
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    async uploadFromXml(xml) {
        // Convert xml string to xml document (if necessary)
        if (typeof xml === "string") {
            const parser = new DOMParser();
            xml = parser.parseFromString(xml.trim(), "text/xml");
        }

        // Ask if BODY damage should be retained
        let retainDamage = {
            body:
                parseInt(this.system.characteristics?.body?.max) -
                parseInt(this.system.characteristics?.body?.value),
            stun:
                parseInt(this.system.characteristics?.stun?.max) -
                parseInt(this.system.characteristics?.stun?.value),
            end:
                parseInt(this.system.characteristics?.end?.max) -
                parseInt(this.system.characteristics?.end?.value),
        };
        if (retainDamage.body || retainDamage.stun || retainDamage.end) {
            let content = `${this.name} has:<ul>`;
            if (retainDamage.body)
                content += `<li>${retainDamage.body} BODY damage</li>`;
            if (retainDamage.stun)
                content += `<li>${retainDamage.stun} STUN damage</li>`;
            if (retainDamage.end)
                content += `<li>${retainDamage.end} END used</li>`;
            content += `</ul><p>Do you want to apply this damage after the upload?</p>`;
            const confirmed = await Dialog.confirm({
                title: "Retain damage after upload?",
                content: content,
            });
            if (confirmed === null) {
                return ui.notifications.warn(`${this.name} upload cancled.`);
            }
            if (!confirmed) {
                retainDamage = {
                    body: 0,
                    stun: 0,
                    end: 0,
                };
            }
        }

        // Remove all existing effects
        await this.deleteEmbeddedDocuments(
            "ActiveEffect",
            this.effects.map((o) => o.id),
        );

        // Remove all items from
        await this.deleteEmbeddedDocuments(
            "Item",
            Array.from(this.items.keys()),
        );

        let changes = {};

        // Convert XML into JSON
        const heroJson = {};
        HeroSystem6eActor._xmlToJsonNode(heroJson, xml.children);

        // Character name is what's in the sheet or, if missing, what is already in the actor sheet.
        const characterName =
            heroJson.CHARACTER.CHARACTER_INFO.CHARACTER_NAME || this.name;
        this.name = characterName;
        changes["name"] = this.name;

        // Reset system property to default
        const _actor = await HeroSystem6eActor.create(
            {
                name: "Test Actor",
                type: this.type,
            },
            { temporary: true },
        );
        const _system = _actor.system;

        const schemaKeys = Object.keys(_system);
        for (const key of Object.keys(this.system)) {
            if (!schemaKeys.includes(key)) {
                changes[`system.-=${key}`] = null;
            }
        }
        for (const key of Object.keys(this.system.characteristics)) {
            if (!Object.keys(_system.characteristics).includes(key)) {
                changes[`system.characteristics.-=${key}`] = null;
            }
        }
        if (this.id) {
            await this.update(changes);
        }

        changes = {};

        // CHARACTERISTICS
        if (heroJson.CHARACTER?.CHARACTERISTICS) {
            for (const [key, value] of Object.entries(
                heroJson.CHARACTER.CHARACTERISTICS,
            )) {
                changes[`system.${key}`] = value;
                this.system[key] = value;
            }
            delete heroJson.CHARACTER.CHARACTERISTICS;
        }

        // is5e
        if (typeof this.system.CHARACTER?.TEMPLATE == "string") {
            if (
                this.system.CHARACTER.TEMPLATE.includes("builtIn.") &&
                !this.system.CHARACTER.TEMPLATE.includes("6E.") &&
                !this.system.is5e
            ) {
                this.system.is5e = true;
            }
            if (
                this.system.CHARACTER.TEMPLATE.includes("builtIn.") &&
                this.system.CHARACTER.TEMPLATE.includes("6E.") &&
                this.system.is5e
            ) {
                this.system.is5e = false;
            }
        }
        if (this.system.COM && !this.system.is5e) {
            this.system.is5e = true;
        }

        if (this.system.is5e && this.id) {
            await this.update({ "system.is5e": this.system.is5e });
        }

        // ITEMS
        for (let itemTag of HeroSystem6eItem.ItemXmlTags) {
            if (heroJson.CHARACTER[itemTag]) {
                for (let system of heroJson.CHARACTER[itemTag]) {
                    let itemData = {
                        name:
                            system.NAME ||
                            system?.ALIAS ||
                            system?.XMLID ||
                            itemTag,
                        type: itemTag.toLowerCase().replace(/s$/, ""),
                        system: system,
                    };

                    // Hack in some basic information with names.
                    // TODO: This should be turned into some kind of short version of the description
                    //       and it should probably be done when building the description
                    switch (system.XMLID) {
                        case "FOLLOWER":
                            itemData.name = "Followers";
                            break;
                        case "ABSORPTION":
                        case "AID":
                        case "DISPEL":
                        case "DRAIN":
                        case "HEALING":
                        case "TRANSFER":
                        case "SUPPRESS":
                            if (!system.NAME) {
                                itemData.name =
                                    system?.ALIAS + " " + system?.INPUT;
                            }
                            break;
                    }

                    if (this.id) {
                        const item = await HeroSystem6eItem.create(itemData, {
                            parent: this,
                        });
                        await item._postUpload();

                        // Treat like a MULTIPOWER for now
                        if (system.XMLID === "COMPOUNDPOWER") {
                            for (let system2 of system.POWER) {
                                let itemData2 = {
                                    name:
                                        system2.NAME ||
                                        system2.ALIAS ||
                                        system2.XMLID,
                                    type: "power",
                                    system: {
                                        ...system2,
                                        PARENTID: system.ID,
                                        POSITION: parseInt(system2.POSITION),
                                    },
                                };
                                const item2 = await HeroSystem6eItem.create(
                                    itemData2,
                                    { parent: this },
                                );
                                await item2._postUpload();
                            }
                        }
                    } else {
                        const item = await HeroSystem6eItem.create(itemData, {
                            temporary: true,
                            parent: this,
                        });
                        //item.id = item.system.XMLID + item.system.POSITION
                        this.items.set(
                            item.system.XMLID + item.system.POSITION,
                            item,
                        );
                        await item._postUpload();
                    }
                }
                delete heroJson.CHARACTER[itemTag];
            }
        }

        // Warn about invalid adjustment targets
        for (const item of this.items.filter((item) =>
            getPowerInfo({ item: item }).powerType?.includes("adjustment"),
        )) {
            const result = item.splitAdjustmentSourceAndTarget();
            if (!result.valid) {
                await ui.notifications.warn(
                    `${this.name} has an unsupported adjustment target "${
                        item.system.INPUT
                    }" for "${
                        item.name
                    }". Use characteristic abbreviations or power names separated by commas for automation support.${
                        item.system.XMLID === "TRANSFER"
                            ? ' Source and target lists should be separated by " -> ".'
                            : ""
                    }`,
                    { console: true, permanent: true },
                );
            } else {
                const maxAllowedEffects =
                    item.numberOfSimultaneousAdjustmentEffects();
                if (
                    result.reducesArray.length > maxAllowedEffects.maxReduces ||
                    result.enhancesArray.length > maxAllowedEffects.maxEnhances
                ) {
                    await ui.notifications.warn(
                        `${this.name} has too many adjustment targets defined for ${item.name}.`,
                    );
                }
            }
        }

        // Perception Skill
        const itemDataPerception = {
            name: "Perception",
            type: "skill",
            system: {
                XMLID: "PERCEPTION",
                ALIAS: "Perception",
                CHARACTERISTIC: "INT",
                state: "trained",
                levels: "0",
            },
        };
        const perceptionItem = await HeroSystem6eItem.create(
            itemDataPerception,
            {
                temporary: this.id ? false : true,
                parent: this,
            },
        );
        await perceptionItem._postUpload();

        // MANEUVERS
        for (const entry of Object.entries(CONFIG.HERO.combatManeuvers)) {
            const name = entry[0];
            const v = entry[1];
            const PHASE = v[0];
            const OCV = v[1];
            const DCV = v[2];
            let EFFECT = v[3];
            if (this.system.is5e && EFFECT.match(/v\/(\d+)/)) {
                let divisor = EFFECT.match(/v\/(\d+)/)[1];
                EFFECT = EFFECT.replace(`v/${divisor}`, `v/${divisor / 2}`);
            }
            const attack = v[4];
            const XMLID = name.toUpperCase().replace(" ", ""); // A fake XMLID
            const itemData = {
                name,
                type: "maneuver",
                system: {
                    PHASE,
                    OCV,
                    DCV,
                    EFFECT,
                    active: false,
                    description: EFFECT,
                    XMLID,
                },
            };

            // Skip if temporary actor (Quench)
            if (this.id) {
                const item = await HeroSystem6eItem.create(itemData, {
                    parent: this,
                });
                if (attack) {
                    await item.makeAttack();
                }
                await item._postUpload();
            }
        }

        // Images
        if (heroJson.CHARACTER.IMAGE) {
            const filename = heroJson.CHARACTER.IMAGE?.FileName;
            const path = "worlds/" + game.world.id + "/tokens";
            const relativePathName = path + "/" + filename;

            // Create a directory if it doesn't already exist
            try {
                await FilePicker.createDirectory("user", path);
            } catch (e) {
                //console.error(e)
            }

            // Set the image, uploading if not already in the file system
            try {
                const imageFileExists = (
                    await FilePicker.browse("user", path)
                ).files.includes(encodeURI(relativePathName));
                if (!imageFileExists) {
                    const extension = filename.split(".").pop();
                    const base64 =
                        "data:image/" +
                        extension +
                        ";base64," +
                        xml.getElementsByTagName("IMAGE")[0].textContent;

                    await ImageHelper.uploadBase64(base64, filename, path);

                    // Update any tokens images that might exist
                    for (const token of this.getActiveTokens()) {
                        await token.document.update({
                            "texture.src": relativePathName,
                        });
                    }
                }

                changes["img"] = relativePathName;
            } catch (e) {
                console.error(e);
                ui.notifications.warn(
                    `${this.name} failed to upload ${filename}.`,
                );
            }

            delete heroJson.CHARACTER.IMAGE;
        } else {
            // No image provided. Make sure we're using the default token.
            changes["img"] = CONST.DEFAULT_TOKEN;
        }

        // Non ITEMS stuff in CHARACTER
        changes = {
            ...changes,
            "system.CHARACTER": heroJson.CHARACTER,
            "system.versionHeroSystem6eUpload": game.system.version,
        };
        this.system.CHARACTER = heroJson.CHARACTER;
        this.system.versionHeroSystem6eUpload = game.system.version;

        if (this.prototypeToken) {
            changes[`prototypeToken.name`] = this.name;
            changes[`prototypeToken.img`] = changes.img;
        }

        // Save all our changes (unless temporary actor/quench)
        if (this.id) {
            await this.update(changes);
        }

        // Set base values to HDC LEVELs and calculate costs of things.
        await this._postUpload(true);

        // Apply retained damage
        if (retainDamage.body || retainDamage.stun || retainDamage.end) {
            this.system.characteristics.body.value -= retainDamage.body;
            this.system.characteristics.stun.value -= retainDamage.stun;
            this.system.characteristics.end.value -= retainDamage.end;
            if (this.id) {
                await this.update({
                    "system.characteristics.body.value":
                        this.system.characteristics.body.value,
                    "system.characteristics.stun.value":
                        this.system.characteristics.stun.value,
                    "system.characteristics.end.value":
                        this.system.characteristics.end.value,
                });
            }
        }
    }

    static _xmlToJsonNode(json, children) {
        if (children.length === 0) return;

        for (const child of children) {
            const tagName = child.tagName;

            let jsonChild = {};
            if (child.childElementCount == 0 && child.attributes.length == 0) {
                jsonChild = child.textContent;
            }
            if (HeroSystem6eItem.ItemXmlTags.includes(child.tagName)) {
                jsonChild = [];
            } else {
                for (const attribute of child.attributes) {
                    switch (attribute.value) {
                        case "Yes":
                        case "YES":
                            jsonChild[attribute.name] = true;
                            break;
                        case "No":
                        case "NO":
                            jsonChild[attribute.name] = false;
                            break;
                        case "GENERIC_OBJECT":
                            jsonChild[attribute.name] =
                                child.tagName.toUpperCase(); // e.g. MULTIPOWER
                            break;
                        default:
                            jsonChild[attribute.name] = attribute.value.trim();
                    }
                }
            }

            if (child.children.length > 0) {
                this._xmlToJsonNode(jsonChild, child.children);
            }

            if (
                HeroSystem6eItem.ItemXmlChildTags.includes(child.tagName) &&
                !HeroSystem6eItem.ItemXmlTags.includes(
                    child.parentElement?.tagName,
                )
            ) {
                json[tagName] ??= [];
                json[tagName].push(jsonChild);
            } else if (Array.isArray(json)) {
                json.push(jsonChild);
            } else {
                json[tagName] = jsonChild;
            }
        }
    }

    async _resetCharacteristicsFromHdc() {
        const changes = {};
        for (const [key, char] of Object.entries(this.system.characteristics)) {
            let powerInfo = getPowerInfo({
                xmlid: key.toUpperCase(),
                actor: this,
            });
            let value =
                parseInt(char.LEVELS || 0) + parseInt(powerInfo?.base || 0);
            changes[`system.characteristics.${key.toLowerCase()}.core`] = value;

            changes[`system.characteristics.${key.toLowerCase()}.max`] = value;
            changes[`system.characteristics.${key.toLowerCase()}.value`] =
                value;
        }
        await this.update(changes);
    }

    async _postUpload(overrideValues) {
        const changes = {};
        let changed = false;

        // is5e
        if (typeof this.system.CHARACTER?.TEMPLATE == "string") {
            if (
                this.system.CHARACTER.TEMPLATE.includes("builtIn.") &&
                !this.system.CHARACTER.TEMPLATE.includes("6E.") &&
                !this.system.is5e
            ) {
                changes[`system.is5e`] = true;
                this.system.is5e = true;
            }
            if (
                this.system.CHARACTER.TEMPLATE.includes("builtIn.") &&
                this.system.CHARACTER.TEMPLATE.includes("6E.") &&
                this.system.is5e
            ) {
                changes[`system.is5e`] = false;
                this.system.is5e = false;
            }
        }
        if (this.system.COM && !this.system.is5e) {
            changes[`system.is5e`] = true;
            this.system.is5e = true;
        }

        if (this.system.is5e && this.id) {
            await this.update({ [`system.is5e`]: this.system.is5e });
        }

        // Characteristics
        for (const key of Object.keys(this.system.characteristics)) {
            if (key === "running") {
                console.log(key);
            }

            let newValue = parseInt(
                this.system?.[key.toUpperCase()]?.LEVELS || 0,
            );
            newValue += this.getCharacteristicBase(key);
            if (this.system.is5e && key === "spd") {
                // SPD is always an integer, but in 5e due to figured characteristics, the base can be fractional.
                newValue = Math.floor(newValue);
            }

            if (this.system.characteristics[key].max != newValue) {
                if (this.id) {
                    //changes[`system.characteristics.${key.toLowerCase()}.max`] = Math.floor(newValue)
                    await this.update({
                        [`system.characteristics.${key.toLowerCase()}.max`]:
                            Math.floor(newValue),
                    });
                } else {
                    this.system.characteristics[key.toLowerCase()].max =
                        Math.floor(newValue);
                }

                changed = true;
            }
            if (
                this.system.characteristics[key].value !=
                    this.system.characteristics[key.toLowerCase()].max &&
                overrideValues
            ) {
                if (this.id) {
                    await this.update({
                        [`system.characteristics.${key.toLowerCase()}.value`]:
                            this.system.characteristics[key.toLowerCase()].max,
                    });
                    //changes[`system.characteristics.${key.toLowerCase()}.value`] = this.system.characteristics[key.toLowerCase()].max
                } else {
                    this.system.characteristics[key.toLowerCase()].value =
                        this.system.characteristics[key.toLowerCase()].max;
                }
                changed = true;
            }
            if (
                this.system.characteristics[key].core != newValue &&
                overrideValues
            ) {
                changes[`system.characteristics.${key.toLowerCase()}.core`] =
                    newValue;
                this.system.characteristics[key.toLowerCase()].core = newValue;
                changed = true;
            }

            // Rollable Characteristics
            this.updateRollable(key.toLowerCase());
        }

        // Save changes
        if (changed && this.id) {
            await this.update(changes);
        }

        // Initiative Characteristic
        if (this.system.initiativeCharacteristic === undefined) {
            if (
                this.system.characteristics.ego.value >
                    this.system.characteristics.dex.value &&
                this.system.characteristics.omcv.value >=
                    this.system.characteristics.ocv.value
            ) {
                if (this.id) {
                    await this.update({
                        "system.initiativeCharacteristic": "ego",
                    });
                } else {
                    this.system.initiativeCharacteristic = "ego";
                }
            }
        }

        // Combat Skill Levels - Enumerate attacks that use OCV
        for (let cslItem of this.items.filter((o) =>
            ["MENTAL_COMBAT_LEVELS", "COMBAT_LEVELS"].includes(o.system.XMLID),
        )) {
            let _ocv = "ocv";
            if (cslItem.system.XMLID === "MENTAL_COMBAT_LEVELS") {
                _ocv = "omcv";
            }

            let attacks = {};
            let checkedCount = 0;

            for (let attack of this.items.filter(
                (o) =>
                    (o.type == "attack" || o.system.subType == "attack") &&
                    o.system.uses === _ocv,
            )) {
                let checked = false;

                // Attempt to determine if attack should be checked
                if (
                    cslItem.system.OPTION_ALIAS.toLowerCase().indexOf(
                        attack.name.toLowerCase(),
                    ) > -1
                ) {
                    checked = true;
                }

                if (
                    cslItem.system.OPTION === "HTH" &&
                    (attack.system.XMLID === "HTH" ||
                        attack.system.XMLID === "HANDTOHANDATTACK" ||
                        attack.system.XMLID === "HKA" ||
                        attack.system.XMLID === "MANEUVER" ||
                        (attack.type === "maneuver" &&
                            !attack.system.EFFECT?.match(/throw/i)))
                ) {
                    checked = true;
                }

                if (
                    cslItem.system.OPTION === "RANGED" &&
                    (attack.system.XMLID === "BLAST" ||
                        attack.system.XMLID === "RKA")
                ) {
                    checked = true;
                }

                if (cslItem.system.OPTION === "ALL") {
                    checked = true;
                }

                if (cslItem.system.OPTION === "TIGHT") {
                    // up to three
                    if (
                        cslItem.system.XMLID === "COMBAT_LEVELS" &&
                        attack.type != "maneuver" &&
                        checkedCount < 3
                    ) {
                        checked = true;
                    }

                    // up to three
                    if (
                        cslItem.system.XMLID === "MENTAL_COMBAT_LEVELS" &&
                        checkedCount < 3
                    ) {
                        checked = true;
                    }
                }

                if (cslItem.system.OPTION === "BROAD") {
                    // A large group is more than 3 but less than ALL (whatever that means).
                    // For now just assume all (non maneuvers).
                    if (
                        cslItem.system.XMLID === "COMBAT_LEVELS" &&
                        attack.type != "maneuver"
                    ) {
                        checked = true;
                    }

                    // For mental BROAD is actuallyl equal to ALL
                    if (cslItem.system.XMLID === "MENTAL_COMBAT_LEVELS") {
                        checked = true;
                    }
                }

                attacks[attack.id] = checked;

                if (checked) checkedCount++;
            }

            // Make sure at least one attacked is checked
            // if (checkedCount === 0 && Object.keys(attacks).length > 0) {
            //     attacks[Object.keys(attacks)[0]] = true;
            // }

            if (cslItem._id) {
                await cslItem.update(
                    { "system.attacks": attacks },
                    { hideChatMessage: true },
                );
            }
        }

        await this.calcCharacteristicsCost();
        await this.CalcActorRealAndActivePoints();

        this.render();

        // Update actor sidebar (needed when name is changed)
        ui.actors.render();

        //ui.notifications.info(`${this.name} upload complete`)

        //Hooks.call('hdcUpload')

        return changed;
    }

    updateRollable(key) {
        const characteristic = this.system.characteristics[key];
        if (characteristic.type === "rollable") {
            if (characteristic.value === 0) {
                characteristic.roll = 8;
            } else if (characteristic.value <= 2) {
                characteristic.roll = 9;
            } else if (characteristic.value <= 7) {
                characteristic.roll = 10;
            } else if (characteristic.value <= 12) {
                characteristic.roll = 11;
            } else if (characteristic.value <= 17) {
                characteristic.roll = 12;
            } else if (characteristic.value <= 22) {
                characteristic.roll = 13;
            } else if (characteristic.value <= 27) {
                characteristic.roll = 14;
            } else if (characteristic.value <= 32) {
                characteristic.roll = 15;
            } else if (characteristic.value <= 37) {
                characteristic.roll = 16;
            } else if (characteristic.value <= 42) {
                characteristic.roll = 17;
            } else if (characteristic.value <= 47) {
                characteristic.roll = 18;
            } else if (characteristic.value <= 52) {
                characteristic.roll = 19;
            } else {
                characteristic.roll = 20;
            }
        }
    }

    async CalcActorRealAndActivePoints() {
        // Calculate realCost & Active Points for bought as characteristics
        let realCost = 0;
        let activePoints = realCost;

        this.system.pointsDetail = {};

        const powers = getCharacteristicInfoArrayForActor(this);
        for (const powerInfo of powers) {
            realCost += parseInt(
                this.system.characteristics[powerInfo.key.toLowerCase()]
                    ?.realCost || 0,
            );
        }
        this.system.pointsDetail.characteristics = realCost;

        activePoints = realCost;

        // Add in costs for items
        // let _splitCost = {}
        for (let item of this.items.filter(
            (o) =>
                o.type != "attack" &&
                o.type != "defense" &&
                o.type != "movement",
        )) {
            // Equipment is typically purchased with money, not character points
            if (item.type != "equipment") {
                const _realCost = parseInt(item.system?.realCost) || 0;

                if (_realCost != 0) {
                    realCost += _realCost;
                    this.system.pointsDetail[item.type] ??= 0;
                    this.system.pointsDetail[item.type] += _realCost;
                }
            }

            activePoints += parseInt(item.system?.activePoints || 0);

            //_splitCost[item.type] = (_splitCost[item.type] || 0) + (item.system?.realCost || 0)
        }

        // DISAD_POINTS: realCost
        const DISAD_POINTS = parseInt(
            this.system.CHARACTER?.BASIC_CONFIGURATION?.DISAD_POINTS || 0,
        );
        const _disadPoints = Math.min(
            DISAD_POINTS,
            this.system.pointsDetail?.disadvantage || 0,
        );
        if (_disadPoints != 0) {
            this.system.pointsDetail.MatchingDisads = -_disadPoints;
            realCost -= _disadPoints;
        }

        this.system.realCost = realCost;
        this.system.activePoints = activePoints;
        if (this.id) {
            await this.update(
                {
                    "system.points": realCost,
                    "system.activePoints": activePoints,
                    "system.pointsDetail": this.system.pointsDetail,
                },
                { render: false },
                { hideChatMessage: true },
            );
        }
    }
}
