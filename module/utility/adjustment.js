import { getPowerInfo } from "../utility/util.js";

export function adjustmentSources(actor) {
    let choices = {};

    let powers = CONFIG.HERO.powers.filter(
        (o) =>
            (o.powerType?.includes("characteristic") ||
                o.powerType?.includes("movement")) &&
            !o.ignoreFor?.includes(actor.type) &&
            !o.ignoreFor?.includes(actor.system.is5e ? "5e" : "6e") &&
            (!o.onlyFor || o.onlyFor.includes(actor.type)),
    );

    // Attack powers
    for (const item of actor.items.filter(
        (o) => o.type === "power" && o.system.XMLID != "MULTIPOWER",
    )) {
        powers.push({ key: item.name });
    }

    for (const power of powers) {
        let key = power.key;
        choices[key.toUpperCase()] = key.toUpperCase();
    }

    // Add * to defensive powers
    for (let key of Object.keys(choices)) {
        if (defensivePowerAdjustmentMultiplier(key, actor) > 1) {
            choices[key] += "*";
        }
    }

    choices[""] = "<none>";
    choices = Object.keys(choices)
        .sort()
        .reduce((obj, key) => {
            obj[key] = choices[key];
            return obj;
        }, {});

    return choices;
}

// 5e (pg 114) indicates PD, ED, and defensive powers
const defensiveCharacteristics5e = ["PD", "ED"];

// 6e (V1 pg 135)
const defensiveCharacteristics6e = [
    "CON",
    "DCV",
    "DMCV",
    "PD",
    "ED",
    "REC",
    "END",
    "BODY",
    "STUN",
];

export function defensivePowerAdjustmentMultiplier(XMLID, actor) {
    if (!XMLID) return 1;

    let configPowerInfo = getPowerInfo({ xmlid: XMLID, actor: actor });
    if (!configPowerInfo) {
        if (actor) {
            configPowerInfo = getPowerInfo({
                xmlid: actor.items.find((o) => o.name.toUpperCase() === XMLID)
                    ?.system?.XMLID,
                actor: actor,
            });
        }
        if (!configPowerInfo) return 1;
    }

    const defenseCharacteristics = actor.system.is5e
        ? defensiveCharacteristics5e
        : defensiveCharacteristics6e;
    if (defenseCharacteristics.includes(XMLID)) {
        return 2;
    }

    if (configPowerInfo.powerType?.includes("defense")) return 2;

    return 1;
}
