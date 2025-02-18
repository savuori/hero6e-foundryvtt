import { determineDefense } from "../utility/defense.js";
import { HeroSystem6eItem } from "../item/item.js";
import { presenceAttackPopOut } from "../utility/presence-attack.js";
import { onManageActiveEffect } from "../utility/effects.js";
import {
    getPowerInfo,
    getCharacteristicInfoArrayForActor,
} from "../utility/util.js";
import {
    CombatSkillLevelsForAttack,
    convertToDcFromItem,
    convertFromDC,
} from "../utility/damage.js";

import { HeroSystem6eActor } from "./actor.js";

export class HeroSystemActorSheet extends ActorSheet {
    /** @override */
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["actor-sheet"],
            template:
                "systems/hero6efoundryvttv2/templates/actor/actor-sheet.hbs",
            tabs: [
                {
                    navSelector: ".sheet-navigation",
                    contentSelector: ".sheet-body",
                    initial: "Attacks",
                },
            ],
            scrollY: [".sheet-body"],
            closeOnSubmit: false, // do not close when submitted
            submitOnChange: true, // submit when any input changes
            itemFilters: {}, // used to track item search filters on some tabs
        });
    }

    /** @override */
    async getData() {
        const data = super.getData();

        const equipmentWeightPercentage =
            parseInt(
                game.settings.get(game.system.id, "equipmentWeightPercentage"),
            ) / 100.0;

        // Alpha Testing (use to show/hide effects)
        data.alphaTesting = game.settings.get(game.system.id, "alphaTesting");

        // Equipment & MartialArts are uncommon.  If there isn't any, then don't show the navigation tab.
        data.hasEquipment = false;
        data.hasMartialArts = false;

        // NPC or PC dropdown
        data.isGM = game.user.isGM;

        // enrichedData
        for (let field of [
            "BIOGRAPHY",
            "BACKGROUND",
            "PERSONALITY",
            "QUOTE",
            "TACTICS",
            "CAMPAIGN_USE",
            "APPEARANCE",
        ]) {
            data[`enriched${field}`] = await TextEditor.enrichHTML(
                data.actor.system.CHARACTER?.CHARACTER_INFO?.[field],
                { async: true },
            );
        }

        let weightTotal = 0;
        let priceTotal = 0;

        data.pointsTitle = "";
        if (data.actor.system.pointsDetail) {
            for (let [key, value] of Object.entries(
                data.actor.system.pointsDetail,
            )) {
                data.pointsTitle += `${key}: ${value}\n`;
            }
        }

        // override actor.items (which is a map) to an array with some custom properties
        let items = [];
        for (let item of data.actor.items) {
            // showToggle
            const itemEffects = item.effects.find(() => true);
            if (itemEffects) {
                item.system.showToggle = true;
                item.system.active = !itemEffects.disabled;
            }

            const actorEffects = data.actor.effects.find(
                (o) => o.origin === this.actor.items.get(item._id).uuid,
            );
            {
                if (actorEffects) {
                    item.system.showToggle = true;
                    item.system.active = !actorEffects.disabled;
                }
            }

            // Framework?
            if (item.system.PARENTID) {
                const parent = data.actor.items.find(
                    (o) => o.system.ID === item.system.PARENTID,
                );
                if (parent) {
                    const parentPosition =
                        parent.system.XMLID === "COMPOUNDPOWER"
                            ? -1 // Compound power starts at a random position. Sub powers start at 0.
                            : parseInt(parent.system.POSITION);
                    item.system.childIdx =
                        parseInt(item.system.POSITION) -
                        parseInt(parentPosition);
                }
            }

            // Endurance
            item.system.endEstimate = parseInt(item.system.end) || 0;

            // Damage
            if (
                item.type == "attack" ||
                item.system.subType === "attack" ||
                item.system.XMLID === "martialart"
            ) {
                // Combat Skill Levels
                const csl = CombatSkillLevelsForAttack(item);

                let { dc, end } = convertToDcFromItem(item);
                item.system.endEstimate = Math.max(
                    item.system.endEstimate,
                    end,
                );

                // text description of damage
                item.system.damage = convertFromDC(item, dc).replace(/ /g, "");

                // Standard Effect
                if (item.system.USESTANDARDEFFECT) {
                    let stun = parseInt(item.system.value * 3);
                    if (
                        item.findModsByXmlid("PLUSONEHALFDIE") ||
                        item.findModsByXmlid("PLUSONEPIP")
                    ) {
                        stun += 1;
                    }
                    item.system.damage = stun;
                }

                if (dc > 0) {
                    if (item.system.killing) {
                        item.system.damage += "K";
                    } else {
                        item.system.damage += "N";
                    }
                }

                // Signed OCV and DCV
                if (item.system.ocv != undefined) {
                    switch (item.system.ocv) {
                        case "--":
                            item.system.ocvEstimated = "";
                            break;

                        case "-v/10":
                            {
                                item.system.ocv = (
                                    "+" + parseInt(item.system.ocv)
                                ).replace("+-", "-");

                                let velocity = 0;

                                // Velocity from drag ruler
                                const tokens = item.actor.getActiveTokens();
                                const token = tokens[0];
                                const combatants = game?.combat?.combatants;
                                if (
                                    combatants &&
                                    typeof dragRuler != "undefined"
                                ) {
                                    if (token) {
                                        let distance =
                                            dragRuler.getMovedDistanceFromToken(
                                                token,
                                            );
                                        let ranges =
                                            dragRuler.getRangesFromSpeedProvider(
                                                token,
                                            );
                                        let speed =
                                            ranges.length > 1
                                                ? ranges[1].range
                                                : 0;
                                        let delta = distance;
                                        if (delta > speed / 2) {
                                            delta = speed - delta;
                                        }
                                        velocity = delta * 5;
                                    }
                                }

                                // Simplistic velocity calc using dragRuler
                                if (velocity === 0 && token) {
                                    if (typeof dragRuler != "undefined") {
                                        if (
                                            dragRuler.getRangesFromSpeedProvider(
                                                token,
                                            ).length > 1
                                        ) {
                                            velocity = parseInt(
                                                dragRuler.getRangesFromSpeedProvider(
                                                    token,
                                                )[1].range || 0,
                                            );
                                        }
                                    }
                                }

                                // Simplistic velocity calc using running & flight
                                if (velocity === 0) {
                                    velocity = parseInt(
                                        item.actor.system.characteristics
                                            .running.value || 0,
                                    );
                                    velocity = Math.max(
                                        velocity,
                                        parseInt(
                                            item.actor.system.characteristics
                                                .flight.value || 0,
                                        ),
                                    );
                                }

                                item.system.ocvEstimated =
                                    //parseInt(item.actor.system.characteristics.ocv.value) +
                                    (
                                        parseInt(csl.ocv) +
                                        parseInt(velocity / 10)
                                    ).signedString();
                            }
                            break;

                        default:
                            item.system.ocv = parseInt(
                                item.system.ocv,
                            ).signedString();
                            item.system.ocvEstimated =
                                //parseInt(item.system.targets === 'omcv' ? item.actor.system.characteristics.omcv.value : item.actor.system.characteristics.ocv.value) +
                                (
                                    parseInt(item.system.ocv) +
                                    parseInt(csl.ocv || csl.omcv)
                                ).signedString();
                    }
                }
                if (item.system.dcv != undefined) {
                    item.system.dcv = parseInt(item.system.dcv).signedString();
                    item.system.dcvEstimated =
                        //parseInt(item.system.targets === 'dmcv' ? item.actor.system.characteristics.dmcv.value : item.actor.system.characteristics.dcv.value) +
                        (
                            parseInt(item.system.dcv) +
                            parseInt(csl.dcv || csl.dmcv)
                        ).signedString();
                }

                // Set +1 OCV
                const setManeuver = item.actor.items.find(
                    (o) =>
                        o.type == "maneuver" &&
                        o.name === "Set" &&
                        o.system.active,
                );
                if (setManeuver) {
                    item.system.ocvEstimated = (
                        parseInt(item.system.ocvEstimated) + 1
                    ).signedString();
                }

                // Haymaker -5 DCV
                const haymakerManeuver = item.actor.items.find(
                    (o) =>
                        o.type == "maneuver" &&
                        o.name === "Haymaker" &&
                        o.system.active,
                );
                if (haymakerManeuver) {
                    item.system.dcvEstimated = (
                        parseInt(item.system.dcvEstimated) - 4
                    ).signedString();
                }
            }

            // Defense
            if (item.type == "defense") {
                item.system.description =
                    CONFIG.HERO.defenseTypes[item.system.defenseType] ||
                    CONFIG.HERO.defenseTypes5e[item.system.defenseType];
            }

            if (item.type == "martialart") {
                data.hasMartialArts = true;
            }

            if (item.type == "equipment") {
                data.hasEquipment = true;

                item.system.weight = (
                    parseFloat(item.system.WEIGHT || 0) *
                    equipmentWeightPercentage
                ).toFixed(1);

                if (item.system.active) {
                    weightTotal += parseFloat(item.system.weight || 0);
                }
                if (parseFloat(item.system.weight || 0) > 0) {
                    item.system.WEIGHTtext =
                        parseFloat(item.system.weight) + "kg";
                } else {
                    item.system.WEIGHTtext = "";
                }

                priceTotal += parseFloat(item.system.PRICE || 0);
                if (parseFloat(item.system.PRICE || 0) > 0) {
                    item.system.PRICEtext =
                        "$" + Math.round(parseFloat(item.system.PRICE));
                } else {
                    item.system.PRICEtext = "";
                }
            }

            if (item.system.subType || item.type == "skill") {
                item.skillRollUpdateValue();
            }

            // Charges
            if (parseInt(item.system.charges?.max || 0) > 0) {
                const costsEnd = item.findModsByXmlid("COSTSEND");
                if (item.system.endEstimate === 0 || !costsEnd)
                    item.system.endEstimate = "";
                item.system.endEstimate += ` [${parseInt(
                    item.system.charges?.value || 0,
                )}${item.system.charges?.recoverable ? "rc" : ""}]`;
                item.system.endEstimate = item.system.endEstimate.trim();
            }

            // 0 END
            if (!item.system.endEstimate) {
                item.system.endEstimate = "";
            }

            items.push(foundry.utils.deepClone(item));
        }

        // Sort attacks
        // Sorting is tricky and not done at the moment.
        // Sorting just the attacks may sort powers as well, which can mess up frameworks.
        //data.items = items.filter(o=> o.system.subType === 'attack' || o.attack === 'attack');
        //data.items.sort((a, b) => a.name.localeCompare(b.name) );
        //data.items = [...data.items, ...items.filter(o=> !(o.system.subType === 'attack' || o.attack === 'attack') )]
        //data.items = items.sort((a, b) => ((a.system.subType === 'attack' || a.attack === 'attack') && (b.system.subType === 'attack' || b.attack === 'attack')) ? a.name.localeCompare(b.name) : 0);
        data.items = items;

        if (data.hasEquipment) {
            if (
                parseFloat(weightTotal).toFixed(1) > 0 ||
                parseFloat(priceTotal).toFixed(2) > 0
            ) {
                data.weightTotal = parseFloat(weightTotal).toFixed(1) + "kg";
                data.priceTotal = "$" + parseFloat(priceTotal).toFixed(2);
            }
        }

        // Characteristics
        const characteristicSet = [];

        let powers = getCharacteristicInfoArrayForActor(this.actor);

        for (const powerInfo of powers) {
            this.actor.updateRollable(powerInfo.key.toLowerCase());

            let characteristic = {
                ...data.actor.system.characteristics[
                    powerInfo.key.toLowerCase()
                ],
            };

            characteristic.key = powerInfo.key.toLowerCase();
            characteristic.value = parseInt(characteristic.value) || 0;
            characteristic.max = parseInt(characteristic.max) || 0;

            characteristic.base = this.actor.getCharacteristicBase(
                powerInfo.key.toUpperCase(),
            );

            characteristic.name = powerInfo.name || powerInfo.key.toUpperCase();
            characteristic.costTitle = powerInfo.cost
                ? `${powerInfo.cost} * (${characteristic.core} - ${characteristic.base})`
                : null;

            // Notes
            if (powerInfo.key === "STR") {
                const strDetails = this.actor.strDetails();
                characteristic.notes = `lift ${strDetails.strLiftText}, throw ${strDetails.strThrow}m`;
            }

            if (powerInfo.key === "LEAPING")
                characteristic.notes = `${Math.max(
                    0,
                    characteristic.value,
                )}m forward, ${Math.max(
                    0,
                    Math.round(characteristic.value / 2),
                )}m upward`;

            characteristic.delta = 0;
            if (data.actor.system.is5e) {
                if (powerInfo.key.toLowerCase() == "pd") {
                    characteristic.notes = "5e figured STR/5";
                }

                if (powerInfo.key.toLowerCase() == "ed") {
                    characteristic.notes = "5e figured CON/5";
                }

                if (powerInfo.key.toLowerCase() == "spd") {
                    characteristic.notes = "5e figured 1 + DEX/10";
                }

                if (powerInfo.key.toLowerCase() == "rec") {
                    characteristic.notes = "5e figured STR/5 + CON/5";
                }

                if (powerInfo.key.toLowerCase() == "end") {
                    characteristic.notes = "5e figured 2 x CON";
                }

                if (powerInfo.key.toLowerCase() == "stun") {
                    characteristic.notes = "5e figured BODY+STR/2+CON/2";
                }

                if (["ocv", "dcv"].includes(powerInfo.key.toLowerCase())) {
                    characteristic.notes = "5e figured DEX/3";
                    characteristic.delta =
                        characteristic.max - characteristic.base;
                }

                if (["omcv", "dmcv"].includes(powerInfo.key.toLowerCase())) {
                    characteristic.notes = "5e figured EGO/3";
                    characteristic.delta =
                        characteristic.max - characteristic.base;
                }
            }

            // Active Effects may be blocking updates
            let ary = [];
            let activeEffects = Array.from(
                this.actor.allApplicableEffects(),
            ).filter((o) =>
                o.changes.find(
                    (p) =>
                        p.key ===
                        `system.characteristics.${powerInfo.key.toLowerCase()}.value`,
                ),
            );
            for (let ae of activeEffects) {
                ary.push(`<li>${ae.name}</li>`);
            }
            if (ary.length > 0) {
                characteristic.valueTitle =
                    "<b>PREVENTING CHANGES</b>\n<ul class='left'>";
                characteristic.valueTitle += ary.join("\n ");
                characteristic.valueTitle += "</ul>";
                characteristic.valueTitle +=
                    "<small><i>Click to unblock</i></small>";
            }

            ary = [];
            activeEffects = Array.from(
                this.actor.allApplicableEffects(),
            ).filter(
                (o) =>
                    o.changes.find(
                        (p) =>
                            p.key ===
                            `system.characteristics.${powerInfo.key.toLowerCase()}.max`,
                    ) && !o.disabled,
            );

            for (let ae of activeEffects) {
                ary.push(`<li>${ae.name}</li>`);
                if (ae._prepareDuration().duration) {
                    let change = ae.changes.find(
                        (o) =>
                            o.key ===
                            `system.characteristics.${powerInfo.key.toLowerCase()}.max`,
                    );
                    if (change.mode === CONST.ACTIVE_EFFECT_MODES.ADD) {
                        characteristic.delta += parseInt(change.value);
                    }
                    if (change.mode === CONST.ACTIVE_EFFECT_MODES.MULTIPLY) {
                        characteristic.delta +=
                            parseInt(characteristic.max) *
                                parseInt(change.value) -
                            parseInt(characteristic.max);
                    }
                }
            }
            if (ary.length > 0) {
                characteristic.maxTitle =
                    "<b>PREVENTING CHANGES</b>\n<ul class='left'>";
                characteristic.maxTitle += ary.join("\n ");
                characteristic.maxTitle += "</ul>";
                characteristic.maxTitle +=
                    "<small><i>Click to unblock</i></small>";
            }

            characteristicSet.push(characteristic);
        }
        data.characteristicSet = characteristicSet;

        // Defense (create fake attacks and get defense results)
        let defense = {};

        // Make a fake actor to hold the fake attacks we're going to create. Give it the
        // same HERO system version as the actor related to this sheet.
        // TODO: Is there a better way to calculate defense without creating fake attacks?
        const defenseCalculationActor = new HeroSystem6eActor(
            {
                name: "Defense Calculation Actor",
                type: "pc",
            },
            { temporary: true },
        );
        defenseCalculationActor.system.is5e = this.actor.system.is5e;

        // Defense PD
        const pdContentsAttack = `
            <POWER XMLID="ENERGYBLAST" ID="1695402954902" BASECOST="0.0" LEVELS="1" ALIAS="Blast" POSITION="0" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" INPUT="PD" USESTANDARDEFFECT="No" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
            </POWER>
        `;
        const pdAttack = await new HeroSystem6eItem(
            HeroSystem6eItem.itemDataFromXml(pdContentsAttack),
            { temporary: true, parent: defenseCalculationActor },
        );
        await pdAttack._postUpload();

        let [
            defenseValue,
            resistantValue /*impenetrableValue*/,
            ,
            damageReductionValue,
            damageNegationValue /*knockbackResistance*/,
            ,
            defenseTagsP,
        ] = determineDefense(this.actor, pdAttack);
        defense.PD = defenseValue;
        defense.rPD = resistantValue;
        defense.PDtags = "PHYSICAL DEFENSE\n";
        defense.rPDtags = "PHYSICAL DEFENSE (RESISTANT)\n";
        for (let tag of defenseTagsP.filter((o) => o.name.match(/pd$/i))) {
            if (tag.resistant) {
                defense.rPDtags += `${tag.value} ${tag.title}\n`;
            } else if (tag.resistant != undefined) {
                defense.PDtags += `${tag.value} ${tag.title}\n`;
            }
        }
        defense.drp = damageReductionValue;
        defense.drptags = "DAMAGE REDUCTION PHYSICAL\n";
        for (let tag of defenseTagsP.filter((o) => o.name.match(/drp$/i))) {
            if (tag.resistant) {
                defense.drptags += `${tag.value} ${tag.title}\n`;
            } else if (tag.resistant != undefined) {
                defense.drptags += `${tag.value} ${tag.title}\n`;
            }
        }
        defense.dnp = damageNegationValue;
        defense.dnptags = "DAMAGE NEGATION PHYSICAL\n";
        for (let tag of defenseTagsP.filter((o) => o.name.match(/dnp$/i))) {
            defense.dnptags += `${tag.value} ${tag.title}\n`;
        }

        // Defense ED
        const edContentsAttack = `
            <POWER XMLID="ENERGYBLAST" ID="1695402954902" BASECOST="0.0" LEVELS="1" ALIAS="Blast" POSITION="0" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" INPUT="ED" USESTANDARDEFFECT="No" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
            </POWER>
        `;
        const edAttack = await new HeroSystem6eItem(
            HeroSystem6eItem.itemDataFromXml(edContentsAttack),
            { temporary: true, parent: defenseCalculationActor },
        );
        await edAttack._postUpload();

        let [
            defenseValueE,
            resistantValueE /* impenetrableValueE */,
            ,
            damageReductionValueE,
            damageNegationValueE /* knockbackResistanceE */,
            ,
            defenseTagsE,
        ] = determineDefense(this.actor, edAttack);
        defense.ED = defenseValueE;
        defense.rED = resistantValueE;
        defense.EDtags = "ENERGY DEFENSE\n";
        defense.rEDtags = "ENERGY DEFENSE (RESISTANT)\n";
        for (let tag of defenseTagsE.filter((o) => o.name.match(/ed$/i))) {
            if (tag.resistant) {
                defense.rEDtags += `${tag.value} ${tag.title}\n`;
            } else if (tag.resistant != undefined) {
                defense.EDtags += `${tag.value} ${tag.title}\n`;
            }
        }
        defense.dre = damageReductionValueE;
        defense.dretags = "DAMAGE REDUCTION ENERGY\n";
        for (let tag of defenseTagsE.filter((o) => o.name.match(/dre$/i))) {
            if (tag.resistant) {
                defense.dretags += `${tag.value} ${tag.title}\n`;
            } else if (tag.resistant != undefined) {
                defense.dretags += `${tag.value} ${tag.title}\n`;
            }
        }
        defense.dne = damageNegationValueE;
        defense.dnetags = "DAMAGE NEGATION ENERGY\n";
        for (let tag of defenseTagsE.filter((o) => o.name.match(/dne$/i))) {
            defense.dnetags += `${tag.value} ${tag.title}\n`;
        }

        // Defense MD
        const mdContentsAttack = `
            <POWER XMLID="EGOATTACK" ID="1695575160315" BASECOST="0.0" LEVELS="1" ALIAS="Mental Blast" POSITION="1" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" USESTANDARDEFFECT="No" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
            <NOTES />
            </POWER>
        `;
        const mdAttack = await new HeroSystem6eItem(
            HeroSystem6eItem.itemDataFromXml(mdContentsAttack),
            { temporary: true, parent: defenseCalculationActor },
        );
        await mdAttack._postUpload();

        let [
            defenseValueM,
            resistantValueM /*impenetrableValueM*/,
            ,
            damageReductionValueM,
            damageNegationValueM /*knockbackResistanceM*/,
            ,
            defenseTagsM,
        ] = determineDefense(this.actor, mdAttack);
        defense.MD = defenseValueM;
        defense.rMD = resistantValueM;
        defense.MDtags = "MENTAL DEFENSE\n";
        defense.rMDtags = "MENTAL DEFENSE (RESISTANT)\n";
        for (let tag of defenseTagsM.filter((o) => o.name.match(/md$/i))) {
            if (tag.resistant) {
                defense.rMDtags += `${tag.value} ${tag.title}\n`;
            } else if (tag.resistant != undefined) {
                defense.MDtags += `${tag.value} ${tag.title}\n`;
            }
        }
        defense.drm = damageReductionValueM;
        defense.drmtags = "DAMAGE REDUCTION MENTAL\n";
        for (let tag of defenseTagsM.filter((o) => o.name.match(/drm$/i))) {
            if (tag.resistant) {
                defense.drmtags += `${tag.value} ${tag.title}\n`;
            } else if (tag.resistant != undefined) {
                defense.drmtags += `${tag.value} ${tag.title}\n`;
            }
        }
        defense.dnm = damageNegationValueM;
        defense.dnmtags = "DAMAGE NEGATION MENTAL\n";
        for (let tag of defenseTagsM.filter((o) => o.name.match(/dnm$/i))) {
            defense.dnmtags += `${tag.value} ${tag.title}\n`;
        }

        // Defense POWD
        const drainContentsAttack = `
            <POWER XMLID="DRAIN" ID="1703727634494" BASECOST="0.0" LEVELS="1" ALIAS="Drain" POSITION="14" MULTIPLIER="1.0" GRAPHIC="Burst" COLOR="255 255 255" SFX="Default" SHOW_ACTIVE_COST="Yes" INCLUDE_NOTES_IN_PRINTOUT="Yes" NAME="" INPUT="BODY" USESTANDARDEFFECT="No" QUANTITY="1" AFFECTS_PRIMARY="No" AFFECTS_TOTAL="Yes">
                <NOTES />
            </POWER>
        `;
        const drainAttack = await new HeroSystem6eItem(
            HeroSystem6eItem.itemDataFromXml(drainContentsAttack),
            { temporary: true, parent: defenseCalculationActor },
        );
        await drainAttack._postUpload();

        let [
            defenseValuePOWD,
            resistantValuePOWD /*impenetrableValuePOWD*/ /*damageReductionValuePOWD*/ /*damageNegationValuePOWD*/ /*knockbackResistancePOWD*/,
            ,
            ,
            ,
            ,
            defenseTagsPOWD,
        ] = determineDefense(this.actor, drainAttack);
        defense.POWD = defenseValuePOWD;
        defense.rPOWD = resistantValuePOWD;
        defense.POWDtags = "POWER DEFENSE\n";
        defense.rPOWDtags = "POWER DEFENSE (RESISTANT)\n";
        for (let tag of defenseTagsPOWD.filter((o) => o.name.match(/powd$/i))) {
            if (tag.resistant) {
                defense.rPOWDtags += `${tag.value} ${tag.title}\n`;
            } else if (tag.resistant != undefined) {
                defense.POWDtags += `${tag.value} ${tag.title}\n`;
            }
        }

        data.defense = defense;

        // Get all applicable effects (from actor and all items)
        data.allTemporaryEffects = Array.from(this.actor.allApplicableEffects())
            .filter((o) => o.duration.duration > 0 || o.statuses.size)
            .sort((a, b) => a.name.localeCompare(b.name));
        data.allConstantEffects = this.actor.getConstantEffects();
        data.allPersistentEffects = this.actor.getPersistentEffects();

        // Add defenses (without active effects) to actorEffects.
        // This provides a nice way to see ALL powers that are effecting
        // the actor regardless of how they are implemented.
        const defensePowers = data.actor.items.filter(
            (o) =>
                (o.system.subType || o.type) === "defense" && !o.effects.size,
        );
        for (let d of defensePowers) {
            d.disabled = !d.system.active;
            switch (
                getPowerInfo({ xmlid: d.system.XMLID, actor: this.actor })
                    ?.duration
            ) {
                case "instant":
                    // Might Vary
                    switch (d.system.XMLID) {
                        case "FORCEWALL":
                            data.allPersistentEffects.push(d);
                            break;
                        default:
                            data.allTemporaryEffects.push(d);
                    }

                    break;
                case "constant":
                    data.allConstantEffects.push(d);
                    break;
                case "persistent":
                    data.allPersistentEffects.push(d);
                    break;
                default:
                    data.allConstantEffects.push(d);

                    if (game.settings.get(game.system.id, "alphaTesting")) {
                        console.log(
                            getPowerInfo({
                                xmlid: d.system.XMLID,
                                actor: this.actor,
                            }),
                        );
                        ui.notifications.warn(
                            `${d.system.XMLID} has no duration specified.`,
                        );
                    }
            }
        }

        // Active Point Summary
        data.activePointSummary = [];
        for (const key of Object.keys(this.actor.system.characteristics)) {
            const char = this.actor.system.characteristics[key];
            const powerInfo = getPowerInfo({
                xmlid: key.toUpperCase(),
                actor: this.actor,
            });
            let valueTop = Math.max(char.value, char.max);
            let activePoints = valueTop * powerInfo.cost;
            if (activePoints > 0) {
                data.activePointSummary.push({
                    name: powerInfo.name || key,
                    activePoints: activePoints,
                });
            }
        }

        for (const item of this.actor.items.filter(
            (o) => o.type != "maneuver",
        )) {
            let powerInfo = getPowerInfo({
                xmlid: item.system.XMLID,
                actor: this.actor,
            });

            let activePoints = item.system.activePoints;

            if (
                item.type == "attack" ||
                item.system.subType === "attack" ||
                item.system.XMLID === "martialart"
            ) {
                const csl = CombatSkillLevelsForAttack(item);
                let { dc } = convertToDcFromItem(item);

                if (dc > 0) {
                    let costPerDice =
                        Math.max(
                            Math.floor((item.system.activePoints || 0) / dc) ||
                                powerInfo.costPerLevel,
                        ) || (item.system.targets === "dcv" ? 5 : 10);
                    dc += csl.dc + Math.floor((csl.ocv + csl.dcv) / 2); // Assume CSL are converted to DCs
                    let ap = dc * costPerDice;

                    const charges = item.findModsByXmlid("CHARGES");
                    if (charges) {
                        ap += (parseInt(charges.OPTION_ALIAS) - 1) * 5;
                    }

                    activePoints = Math.max(activePoints, ap);
                }
            }

            if (activePoints > 0) {
                let name = item.name;
                if (item.name.toUpperCase().indexOf(item.system.XMLID) == -1) {
                    name += ` (${item.system.XMLID})`;
                }

                data.activePointSummary.push({
                    name: name,
                    activePoints: activePoints,
                });
            }
        }
        data.activePointSummary.sort((a, b) => b.activePoints - a.activePoints);
        let topActivePoints = data.activePointSummary[0].activePoints;
        data.activePointSummary = data.activePointSummary.filter(
            (o) => o.activePoints >= topActivePoints * 0.5,
        );

        return data;
    }

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);

        // Rollable items
        html.find(".item-rollable").click(this._onItemRoll.bind(this));

        // Rollable characteristic
        html.find(".characteristic-roll").click(
            this._onCharacteristicRoll.bind(this),
        );

        // Toggle items
        html.find(".item-toggle").click(this._onItemToggle.bind(this));

        // Edit Items
        html.find(".item-edit").click(this._onItemEdit.bind(this));

        // Delete Items
        html.find(".item-delete").click(this._onItemDelete.bind(this));

        // Create Items
        html.find(".item-create").click(this._onItemCreate.bind(this));

        // Upload HDC file
        html.find(".upload-button").change(
            this._uploadCharacterSheet.bind(this),
        );

        html.find(".recovery-button").click(this._onRecovery.bind(this));
        html.find(".presence-button").click(this._onPresenceAttack.bind(this));
        html.find(".full-health-button").click(this._onFullHealth.bind(this));
        html.find(".actor-description-button").click(
            this._onActorDescription.bind(this),
        );

        // Active Effects
        html.find(".effect-create").click(this._onEffectCreate.bind(this));
        html.find(".effect-delete").click(this._onEffectDelete.bind(this));
        html.find(".effect-edit").click(this._onEffectEdit.bind(this));
        html.find(".effect-toggle").click(this._onEffectToggle.bind(this));

        html.find(".item-chat").click(this._onItemChat.bind(this));

        html.find("td.characteristic-locked").click(
            this._onUnlockCharacteristic.bind(this),
        );

        // Drag events for macros.
        if (this.actor.isOwner) {
            const handler = (ev) => this._onDragStart(ev);

            html.find("tr.item").each((i, el) => {
                el.setAttribute("draggable", true);
                el.addEventListener("dragstart", handler, false);
            });
        }
    }

    /** @override */
    async _updateObject(event, formData) {
        let expandedData = foundry.utils.expandObject(formData);

        const characteristics = ["body", "stun", "end"];
        for (const characteristic of characteristics) {
            if (
                expandedData.Xsystem.characteristics[characteristic].value !==
                this.actor.system.characteristics[characteristic].value
            ) {
                expandedData.system.characteristics[characteristic].value =
                    expandedData.Xsystem.characteristics[characteristic].value;
            }
        }

        this.options.itemFilters.power = expandedData.itemFilters.power;
        this.options.itemFilters.skill = expandedData.itemFilters.skill;

        await this.actor.update(expandedData);

        if (expandedData.system.characteristics) {
            await this.actor.calcCharacteristicsCost();
            await this.actor.CalcActorRealAndActivePoints();
        }

        this.render();
    }

    async _onItemRoll(event) {
        event.preventDefault();
        const itemId = $(event.currentTarget)
            .closest("[data-item-id]")
            .data().itemId;
        const item = this.actor.items.get(itemId);
        item.roll(event);
    }

    async _onItemChat(event) {
        event.preventDefault();
        const itemId = $(event.currentTarget)
            .closest("[data-item-id]")
            .data().itemId;
        const item = this.actor.items.get(itemId);
        item.chat();
    }

    async _onCharacteristicRoll(event) {
        event.preventDefault();
        const element = event.currentTarget.closest("button");
        const dataset = element.dataset;
        const charRoll = parseInt(element.textContent.slice(0, -1));

        if (dataset.roll) {
            const actor = this.actor;

            const roll = new Roll(dataset.roll, this.actor.getRollData());
            roll.evaluate({ async: true }).then(function (result) {
                // let margin = actor.system.characteristics[dataset.label].roll - result.total;
                const margin = charRoll - result.total;

                result.toMessage({
                    speaker: ChatMessage.getSpeaker({ actor }),
                    flavor:
                        dataset.label.toUpperCase() +
                        ` (${charRoll}-) roll ` +
                        (margin >= 0 ? "succeeded" : "failed") +
                        " by " +
                        Math.abs(margin),
                    borderColor: margin >= 0 ? 0x00ff00 : 0xff0000,
                });
            });
        }
    }

    async _onItemToggle(event) {
        event.preventDefault();
        const itemId = $(event.currentTarget)
            .closest("[data-item-id]")
            .data().itemId;
        const item = this.actor.items.get(itemId);
        item.toggle();
    }

    async _onItemEdit(event) {
        const itemId = $(event.currentTarget)
            .closest("[data-item-id]")
            .data().itemId;
        const item = this.actor.items.get(itemId);
        item.sheet.render(true);
    }

    async _onItemDelete(event) {
        const itemId = $(event.currentTarget)
            .closest("[data-item-id]")
            .data().itemId;
        const item = this.actor.items.get(itemId);
        const confirmed = await Dialog.confirm({
            title: game.i18n.localize(
                "HERO6EFOUNDRYVTTV2.confirms.deleteConfirm.Title",
            ),
            content: game.i18n.localize(
                "HERO6EFOUNDRYVTTV2.confirms.deleteConfirm.Content",
            ),
        });

        if (confirmed) {
            item.delete();
            this.render();
        }
    }

    async _onItemCreate(event) {
        event.preventDefault();
        const header = event.currentTarget;
        // Get the type of item to create.
        const type = header.dataset.type;
        // Grab any data associated with this control.
        const data = foundry.utils.duplicate(header.dataset);
        // Initialize a default name.
        const name = `New ${type.capitalize()}`;

        // Prepare the item object.
        const itemData = {
            name,
            type,
            system: data,
        };
        // Remove the type from the dataset since it's in the itemData.type prop.
        delete itemData.system.type;

        // Finally, create the item!
        return await HeroSystem6eItem.create(itemData, { parent: this.actor });
    }

    async _onEffectCreate(event) {
        onManageActiveEffect(event, this.actor);
    }

    async _onEffectDelete(event) {
        onManageActiveEffect(event, this.actor);
    }

    async _onEffectToggle(event) {
        onManageActiveEffect(event, this.actor);
    }

    async _onEffectEdit(event) {
        onManageActiveEffect(event, this.actor);
    }

    async _onRecovery() {
        this.actor.TakeRecovery({ asAction: true });
    }

    async _onPresenceAttack() {
        presenceAttackPopOut(this.actor);
    }

    async _onFullHealth() {
        const confirmed = await Dialog.confirm({
            title:
                game.i18n.localize(
                    "HERO6EFOUNDRYVTTV2.confirms.fullHealthConfirm.Title",
                ) + ` [${this.actor.name}]`,
            content: game.i18n.localize(
                "HERO6EFOUNDRYVTTV2.confirms.fullHealthConfirm.Content",
            ),
        });
        if (!confirmed) return;
        return this.actor.FullHealth();
    }

    async _onActorDescription() {
        let content = `${this.actor.system.APPEARANCE || ""}`;
        let perceivable = [];
        for (let item of this.actor.items) {
            if (item.isPerceivable(true)) {
                perceivable.push(
                    `<b>${item.name}</b> ${item.system.description}`,
                );
            }
        }
        if (perceivable.length > 0) {
            perceivable.sort();
            content += "<ul>";
            for (let p of perceivable) {
                content += `<li>${p}</li>`;
            }
            content += "</ul>";
        }

        let token = this.actor.token;
        let speaker = ChatMessage.getSpeaker({ actor: this.actor, token });
        const chatData = {
            user: game.user._id,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            content: content,
            speaker: speaker,
        };
        return ChatMessage.create(chatData);
    }

    async _uploadCharacterSheet(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }
        const reader = new FileReader();
        reader.onload = async function (event) {
            const contents = event.target.result;

            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(contents, "text/xml");
            await this.actor.uploadFromXml(xmlDoc);
            ui.notifications.info(`${this.actor.name} upload complete`);
        }.bind(this);
        reader.readAsText(file);
    }

    async _onUnlockCharacteristic(event) {
        event.preventDefault();

        // The event will not be generated from the disabled input (since disabled elements
        // don't generally allow mouse events) but rather from the enclosing td element.
        // Find its child input element
        const input = event.target.querySelector("input");

        // Find all associated Active Effects
        let activeEffects = Array.from(
            this.actor.allApplicableEffects(),
        ).filter((o) => o.changes.find((p) => p.key === input.name));
        for (let ae of activeEffects) {
            // Delete status
            if (ae.statuses) {
                let confirmed = await Dialog.confirm({
                    title: game.i18n.localize(
                        "HERO6EFOUNDRYVTTV2.confirms.deleteConfirm.Title",
                    ),
                    content: `Remove ${ae.name}?`,
                });

                if (confirmed) {
                    await ae.delete();
                }
                continue;
            }

            // Delete Temporary Effects
            if (parseInt(ae.duration?.seconds || 0) > 0) {
                let confirmed = await Dialog.confirm({
                    title: game.i18n.localize(
                        "HERO6EFOUNDRYVTTV2.confirms.deleteConfirm.Title",
                    ),
                    content: `Delete ${ae.name}?`,
                });

                if (confirmed) {
                    await ae.delete();
                }
                continue;
            }

            // Turn off Permanent powers
            if (ae.parent instanceof HeroSystem6eItem) {
                let confirmed = await Dialog.confirm({
                    title: "Turn off?",
                    content: `Turn off ${ae.name}?`,
                });

                if (confirmed) {
                    await ae.parent.toggle();
                }
                continue;
            }
        }

        await this.actor.applyEncumbrancePenalty();
    }
}
