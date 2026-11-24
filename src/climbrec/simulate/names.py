"""Made-up names for sectors, boulders, and problems."""

from __future__ import annotations

import numpy as np

SECTOR_NAMES = [
    "Parking Lot Boulders",
    "Warm-Up Wall",
    "The Pond Caves",
    "Summit Blocks",
    "Fern Gully",
    "Dam Area",
    "Lost Crag",
    "Hemlock Hollow",
    "Quarry Rim",
    "Back Forty",
]

BOULDER_WORDS_A = [
    "Toad", "Whale", "Anvil", "Coffin", "Turtle", "Bread Loaf", "Haystack",
    "Ship", "Molar", "Elephant", "Prow", "Pyramid", "Wedge", "Mushroom",
    "Egg", "Bunker", "Sphinx", "Cube", "Thumb", "Igloo", "Shark Fin",
    "Lighthouse", "Cauldron", "Saddle", "Tusk", "Pulpit", "Throne", "Barge",
]
BOULDER_WORDS_B = ["Boulder", "Rock", "Block", "Stone", "Boulder", "Boulder"]

PROBLEM_ADJ = [
    "Crimson", "Slippery", "Electric", "Silent", "Hungry", "Crooked", "Golden",
    "Wicked", "Lazy", "Frozen", "Burning", "Hidden", "Angry", "Velvet",
    "Rusty", "Feral", "Hollow", "Lucky", "Gentle", "Savage", "Midnight",
    "Paper", "Iron", "Glass", "Sticky", "Wild", "Tiny", "Grand", "Phantom",
    "Cosmic", "Sour", "Sweet", "Dusty", "Mossy", "Bitter", "Polished",
]
PROBLEM_NOUN = [
    "Tomato", "Arete", "Dihedral", "Lobster", "Pancake", "Prophet", "Monkey",
    "Traverse", "Lip", "Crack", "Pocket", "Wave", "Chimney", "Banana",
    "Dragon", "Pinch", "Sloper", "Scoop", "Flake", "Mantel", "Owl", "Hueco",
    "Viking", "Butter", "Gargoyle", "Sermon", "Meteor", "Weasel", "Kraken",
    "Lantern", "Biscuit", "Cobra", "Pilgrim", "Rooftop", "Ladder", "Comet",
]


def boulder_names(n: int, rng: np.random.Generator) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    while len(names) < n:
        name = f"{rng.choice(BOULDER_WORDS_A)} {rng.choice(BOULDER_WORDS_B)}"
        if name in seen:
            name = f"{name} {len([s for s in seen if s.startswith(name)]) + 1}"
        seen.add(name)
        names.append(name)
    return names


def problem_name(rng: np.random.Generator, *, sit_start: bool, eliminate: bool, traverse: bool) -> str:
    noun = "Traverse" if traverse and rng.random() < 0.5 else str(rng.choice(PROBLEM_NOUN))
    name = f"{rng.choice(PROBLEM_ADJ)} {noun}"
    if eliminate:
        name += " Eliminate"
    if sit_start:
        name += " Sit"
    return name
