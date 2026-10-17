"""Resolve each card's people from the client's Role.Represents field."""

REPRESENTATIVE_KEYS = {
    'Dog': 'asahi', 'Cat': 'ryut',
    'Octopus': 'psion', 'Human': 'somer',
    'Crow': 'towa', 'Sparrow': 'ignas',
    'Snake': 'gaen', 'Fox': 'luce',
}


def assign_characters(card, represents, profiles):
    tokens = represents.split('~')
    if not represents or any(token not in REPRESENTATIVE_KEYS for token in tokens):
        raise ValueError(f"{card['id']}: unknown Role.Represents {represents!r}")
    keys = {REPRESENTATIVE_KEYS[token] for token in tokens}
    # Keep the established character order for two-person cards.
    people = [profile for profile in profiles if profile['key'] in keys]
    if len(people) != len(keys):
        raise ValueError(f"{card['id']}: missing character profile")
    card['characters'] = [profile['key'] for profile in people]
    card['pair'] = ' / '.join(profile['name'] for profile in people)
