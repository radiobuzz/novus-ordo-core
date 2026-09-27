#!/usr/bin/env python3
"""Extract literal NO2 policy data without executing the legacy PHP application.

Usage: python3 scripts/research/extract_no2_policies.py ARCHIVE OUTPUT_JSON
This deliberately supports only the literal assignments/array_push statements in
the historical legal.params.php. Unsupported values fail instead of being eval'd.
"""
import argparse
import copy
import hashlib
import json
import re
import zipfile
from pathlib import Path

MEMBER = 'no/modules/legal/legal.params.php'
ROOTS = {'legis', 'budgets', 'reforms', 'issues', 'systems'}
LEX = re.compile(r'''\s+|/\*.*?\*/|//[^\n]*|\#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\$?[A-Za-z_][A-Za-z_0-9]*|\d+(?:\.\d+)?|=>|.''', re.S)


def tokenize(source):
    return [(m.group(), source.count('\n', 0, m.start()) + 1)
            for m in LEX.finditer(source)
            if not m.group().isspace() and not m.group().startswith(('/*', '//', '#'))]


def string_value(s):
    body = s[1:-1]
    escapes = {"\\": "\\", s[0]: s[0]}
    if s[0] == '"':
        escapes.update({'n': '\n', 'r': '\r', 't': '\t', '$': '$'})
    return re.sub(r'\\(.)', lambda m: escapes.get(m[1], m[0]), body)


class Reader:
    def __init__(self, tokens):
        self.tokens, self.i = tokens, 0

    def peek(self):
        return self.tokens[self.i][0] if self.i < len(self.tokens) else None

    def take(self, expected=None):
        token, line = self.tokens[self.i]
        if expected is not None and token != expected:
            raise ValueError(f'Line {line}: expected {expected}, found {token}')
        self.i += 1
        return token

    def path(self):
        path = [self.take()[1:]]
        while self.peek() == '[':
            self.take('[')
            path.append(self.value())
            self.take(']')
        return path

    def value(self):
        token = self.take()
        if token[0] in '\"\'':
            return string_value(token)
        if token in ('true', 'false', 'null'):
            return {'true': True, 'false': False, 'null': None}[token]
        if token == '-':
            return -self.value()
        if re.fullmatch(r'\d+(?:\.\d+)?', token):
            return float(token) if '.' in token else int(token)
        if token == 'array':
            self.take('(')
            pairs, index = {}, 0
            while self.peek() != ')':
                val = self.value()
                if self.peek() == '=>':
                    self.take('=>')
                    key, val = val, self.value()
                else:
                    key = index
                pairs[key] = val
                if isinstance(key, int):
                    index = max(index, key + 1)
                if self.peek() != ',':
                    break
                self.take(',')
            self.take(')')
            return list(pairs.values()) if list(pairs) == list(range(len(pairs))) else pairs
        raise ValueError(f'Unsupported literal {token} at line {self.tokens[self.i-1][1]}')


def extract(source, roots=ROOTS):
    reader = Reader(tokenize(source))
    data, assignments, overwrites = {}, [], []
    depth = 0
    while reader.peek() is not None:
        token, line = reader.tokens[reader.i]
        is_assignment = depth == 0 and token.startswith('$') and token[1:] in roots
        is_append = (depth == 0 and token == 'array_push'
                     and reader.tokens[reader.i + 2][0] in {'$' + root for root in roots})
        if is_assignment or is_append:
            if is_append:
                reader.take('array_push'); reader.take('(')
            path = reader.path()
            if not is_append and reader.peek() != '=':
                continue  # A read, e.g. ModMan::set("legis", $legis).
            reader.take(',' if is_append else '=')
            value = reader.value()
            if is_append:
                reader.take(')')
            reader.take(';')
            target = data
            for key in path[:-1]:
                if key not in target or target[key] == []:
                    target[key] = {}
                target = target[key]
            key = path[-1]
            if is_append:
                target[key].append(value)
            else:
                if key in target:
                    overwrites.append({'path': path, 'line': line, 'previous': copy.deepcopy(target[key]), 'replacement': value})
                target[key] = value
            assignments.append({'path': path, 'line': line, 'operation': 'append' if is_append else 'assign', 'value': copy.deepcopy(value)})
            continue
        reader.take()
        if token == '{':
            depth += 1
        elif token == '}':
            depth -= 1
    return data, assignments, overwrites


def markdown_catalogue(payload):
    definitions = payload['definitions']
    locations = {tuple(a['path']): a['line'] for a in payload['source_assignments']}

    def cell(value):
        return str(value).replace('|', '\\|').replace('\n', ' ')

    def literal(value):
        return '`' + cell(json.dumps(value, ensure_ascii=False)) + '`'

    lines = [
        '# NO2 — extracted policy catalogue', '',
        'Generated from the historical archive; original spelling, values and apparent mistakes are preserved.', '',
        'Read [the analysis and caveats](no2-policy-extraction.md) before interpreting these fields. '
        'The [JSON extraction](data/no2-policy-catalogue.json) includes complete metadata, presets, source assignments and indicator formulas.', '',
        'Source: `no/modules/legal/legal.params.php` in `no_old_backup_from_20100226.zip`. '
        'Line references below are archive-member line numbers, not current-game files. '
        'Original source notice: Copyright 2006 Frédéric Brown; GPL-2.0-or-later.', '',
        'A **topic** is a policy question; a **measure** is one option. '
        'Radio topics select one option; checkboxes allow independent measures. '
        '“Default” reports the definition flag, not a guarantee that a starting preset selects it. '
        'Unlisted numeric effects are absent, not implicitly zero for every aggregation rule. '
        'Fields below are legacy inputs, not promised per-turn indicator changes.', '',
        '| Domain | Topics | Options |', '| --- | ---: | ---: |',
    ]
    for domain in definitions['legis'].values():
        lines.append(f"| {domain['description']} | {len(domain['topics'])} | {sum(len(t['mesures']) for t in domain['topics'].values())} |")
    metadata = {'description', 'type', 'default', 'enables', 'vars'}
    for domain_id, domain in definitions['legis'].items():
        lines += ['', f"## {domain['description']} (`{domain_id}`)", '']
        for topic_id, topic in domain['topics'].items():
            path = ('legis', domain_id, 'topics', topic_id)
            mode = 'Independent checkboxes' if all(m.get('type') == 'check' for m in topic['mesures'].values()) else 'Exclusive choice (radio)'
            enabled = 'Requires an enabling measure' if topic.get('enabled') is False else 'Available by default'
            lines += ['', f"### {topic['description']} (`{topic_id}`)", '', f"{mode}. {enabled}. Source line {locations[path + ('description',)]}.", '']
            if topic.get('vars'):
                lines += ['Topic input metadata: ' + literal(topic['vars']) + '.', '']
            lines += ['| Option | Original description | Default | Fields and dependencies | Source line |', '| --- | --- | --- | --- | ---: |']
            for option_id, option in topic['mesures'].items():
                fields = [f'`{key}` = {literal(value)}' for key, value in option.items() if key not in metadata]
                if option.get('enables'):
                    fields.append('Unlocks: ' + ', '.join(f'`{t}`' for t in option['enables']))
                if option.get('vars'):
                    fields.append('Input metadata: ' + literal(option['vars']))
                line = locations[path + ('mesures', option_id, 'description')]
                lines.append(f"| `{option_id}` | {cell(option['description'])} | {'Yes' if option.get('default') else '—'} | {'; '.join(fields) or 'No additional fields'} | {line} |")
    lines += ['', '## Reform packages', '',
              'Packages replace the selection in each listed topic. An empty selection clears that topic; '
              'the optional fourth value `true` means add without replacing other selections. '
              'Three tax reforms call dedicated functions instead of setting catalogue measures. '
              'Hidden packages remain available to other game flows.', '']
    for group_id, group in definitions['reforms'].items():
        lines += [f"### {group['description']} (`{group_id}`)", '']
        for reform_id, reform in group['reforms'].items():
            path = ('reforms', group_id, 'reforms', reform_id)
            lines += [f"- **{reform['description']}** (`{reform_id}`; line {locations[path + ('description',)]}; {'hidden' if reform.get('dont_show') else 'shown'})."]
            changes = []
            for domain, topic, selected, *extra in reform['mesures']:
                changes.append(f'`{domain}/{topic}` → {literal(selected)}' + (' (add)' if extra and extra[0] else ' (replace)'))
            if not changes:
                changes.append('Custom handler: ' + literal(reform['fct_enact']))
            lines += ['  ' + '; '.join(changes) + '.', '']
    lines += ['## Conditional issues', '', 'Conditions are preserved source expressions, never evaluated by the extractor.', '']
    for issue_id, issue in definitions['issues'].items():
        lines += [f"### {issue['title']} (`{issue_id}`)", '', 'Trigger: ' + literal(issue['cond']), '', issue['text'], '']
        for choice in issue['choices']:
            lines += [f"- {choice['desc']} → {literal(choice['reform'])}" + ('; condition: ' + literal(choice['cond']) if 'cond' in choice else '')]
        lines += ['']
    return '\n'.join(lines).rstrip() + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--markdown', type=Path)
    args = parser.parse_args()
    archive = args.archive.read_bytes()
    with zipfile.ZipFile(args.archive) as z:
        source = z.read(MEMBER).decode('latin-1')
        indicator_member = 'no/modules/demography/demography.params.php'
        indicator_source = z.read(indicator_member).decode('latin-1')
    data, assignments, overwrites = extract(source)
    indicators, indicator_assignments, _ = extract(indicator_source, {'indexDescs'})
    topics = [t for domain in data['legis'].values() for t in domain['topics'].values()]
    options = [m for t in topics for m in t['mesures'].values()]
    reform_list = [r for group in data['reforms'].values() for r in group['reforms'].values()]
    payload = {
        'purpose': 'Historical evidence; not a new-game runtime schema or balance specification.',
        'source': {'archive': args.archive.name, 'sha256': hashlib.sha256(archive).hexdigest(), 'member': MEMBER, 'encoding': 'latin-1'},
        'original_source_notice': 'Copyright 2006 Frédéric Brown; GPL-2.0-or-later.',
        'method': 'Static parsing of top-level literal assignments and array_push. Comments excluded; no PHP executed. Last assignment wins. Empty PHP arrays represented as JSON lists until named keys are assigned. Original IDs/spelling preserved.',
        'runtime_defaults_not_materialized': {
            'measure_type': 'radio when type is absent',
            'topic_enabled': 'true when enabled is absent',
            'reform_fct_enact': ['Legal_Functions', 'enactReform'],
            'reform_fct_implem': ['Legal_Functions', 'calcImplementation'],
        },
        'counts': {'domains': len(data['legis']), 'topics': len(topics), 'options': len(options), 'checkbox_options': sum(m.get('type') == 'check' for m in options), 'reforms': len(reform_list), 'hidden_reforms': sum(r.get('dont_show', False) for r in reform_list), 'issues': len(data['issues'])},
        'definitions': data,
        'overwritten_assignments': overwrites,
        'source_assignments': assignments,
        'supporting_indicators': {'source_member': indicator_member, 'definitions': indicators['indexDescs'], 'source_assignments': indicator_assignments, 'runtime_defaults_not_materialized': {'min': 0, 'max': 1, 'neutral': 0.5}},
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    if args.markdown:
        args.markdown.write_text(markdown_catalogue(payload))
    print(json.dumps(payload['counts']))
    print(f'{len(assignments)} literal writes; {len(overwrites)} overwritten assignments')


if __name__ == '__main__':
    main()
