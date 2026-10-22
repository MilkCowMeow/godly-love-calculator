"""全量发布正文、共享词典、三星技能精确引用与保护行为回归。"""
from copy import deepcopy
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from audit_client_content import EXPECTED_RELEASES, audit_published, default_source_tables, load_published
from client_text import clean_text


class PublishedContentCompletenessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.calculator, cls.catalog = load_published()

    def test_complete_published_content(self):
        report = audit_published(self.calculator, self.catalog)
        self.assertEqual(report['errors'], [], str(report['errors'][:10]))
        self.assertEqual(report['facts']['enhanceSkillReferences'], 192)
        self.assertEqual(len(report['facts']['enhanceSkillS4']), 7)

    def release_sample(self, identifier):
        calculator, catalog = deepcopy(self.calculator), deepcopy(self.catalog)
        release = EXPECTED_RELEASES[identifier]
        calculator.update(catalog=identifier, asOf=release['asOf'])
        catalog.update(catalog=identifier, asof=release['asOf'])
        cards = {card['id']: card for card in calculator['cards']}
        cat_cards = {card['id']: card for card in catalog['cards']}
        for cid, fields in release['roleFields'].items():
            cards[cid]['raw'].update(fields)
            cat_cards[cid]['version_gate'] = (cards[cid]['raw'].get('VersionControl')
                                             or cards[cid]['itemRaw'].get('VersionControl', ''))
        for sid, fields in release['skillFields'].items():
            calculator['skills'][sid]['raw'].update(fields)
            for card in catalog['cards']:
                for skill in card['skills']:
                    if skill['id'] == sid:
                        skill['row'].update(fields)
        return calculator, catalog

    def test_every_known_release_has_strict_coverage_and_field_guards(self):
        self.assertEqual(set(EXPECTED_RELEASES), {'catalog_014774', 'catalog_014866'})
        for identifier in EXPECTED_RELEASES:
            with self.subTest(catalog=identifier):
                calculator, catalog = self.release_sample(identifier)
                self.assertEqual(audit_published(calculator, catalog)['errors'], [])
                calculator['cards'].pop()
                catalog['cards'].pop()
                report = audit_published(calculator, catalog)
                self.assertTrue(any(error['path'] == 'cards' and '预期192' in error['error']
                                    for error in report['errors']))
                calculator, catalog = self.release_sample(identifier)
                calculator['skills']['C04_SSR_006S1']['raw']['Description'] = 'WrongDescriptionKey'
                report = audit_published(calculator, catalog)
                self.assertTrue(any(error['path'] == 'C04_SSR_006S1.raw.Description'
                                    for error in report['errors']))

    def test_unknown_release_requires_explicit_audit_expectations(self):
        calculator, catalog = deepcopy(self.calculator), deepcopy(self.catalog)
        calculator['catalog'] = catalog['catalog'] = 'catalog_unknown'
        report = audit_published(calculator, catalog)
        self.assertTrue(any(error['path'] == 'catalog' and '版本审计预期' in error['error']
                            for error in report['errors']))

    def test_default_source_tables_follow_the_published_release(self):
        for identifier, release in EXPECTED_RELEASES.items():
            directory = default_source_tables({'catalog': identifier})
            self.assertEqual(directory.name, 'tables')
            self.assertEqual(directory.parent.name, 'update_' + release['asOf'].replace('-', ''))
        with self.assertRaisesRegex(ValueError, '版本审计预期'):
            default_source_tables({'catalog': 'catalog_unknown'})

    def test_client_functions_and_config_only_terms_are_present(self):
        data = self.calculator
        glossary = {entry['id']: entry for entry in data['glossary']}
        for identifier in ('Penetrate', 'AddPinchSkill', 'Torrent', 'CantMove',
                           'HurtReduction', 'SetTime', 'TransferDeBuff'):
            self.assertTrue(glossary[identifier]['name'])
            self.assertTrue(glossary[identifier]['description'])
        cards = {card['id']: card for card in data['cards']}
        associations = {
            'C03_SSR_004': {'AddAttackBig', 'Penetrate', 'SetTime'},
            'C04_SSR_004': {'IncreaseCriticalHitResistance'},
            'C01_SR_001': {'AddDefence'}, 'C01_SR_004': {'Invincible'},
            'C01_SR_005': {'ReduceDef'},
            'C02_SR_001': {'AddAttackBig', 'Immune', 'IncreaseCriticalHitDamage'},
            'C03_SR_001': {'Invincible'}, 'C03_R_102': {'TargetTaunt'},
        }
        for identifier, expected in associations.items():
            self.assertTrue(expected <= set(cards[identifier]['glossaryIds']), identifier)
        for identifier in ('Blast_Burn', 'Immortal_Mark', 'C01_SSR_010_c'):
            self.assertIn(identifier, data['statuses'])
            self.assertNotIn(identifier, glossary)

    def test_source_empty_auxiliary_descriptions_are_complete(self):
        skills = self.calculator['skills']
        auxiliary = [skill for skill in skills.values() if not skill['raw']['Description']]
        self.assertEqual(len(auxiliary), 8)
        for skill in auxiliary:
            self.assertEqual(skill['descriptionSource'], 'configuration')
            self.assertIn('攻击', skill['description'])
            self.assertIn('%', skill['description'])
        self.assertIn('行动值提高12%', skills['C01_SSR_010S3']['description'])
        self.assertIn('基础概率', skills['C04_SSR_003S3']['description'])

    def test_attack_scope_and_inactive_function_terms(self):
        skills = self.calculator['skills']
        for identifier in ('C02_SR_006S1', 'C03_SSR_015S1', 'C04_SR_006S1',
                           'C04_SSR_014S1', 'C03_SR_008S2', 'C03_SR_009S2',
                           'C03_SR_010S2', 'C04_SR_011S2'):
            self.assertEqual(skills[identifier]['damageTarget'], '一名敌人')
            self.assertIn('选定敌人', skills[identifier]['description'])
        self.assertEqual(skills['C03_SSR_014S2']['damageTarget'], '')
        self.assertIn('终结技冷却中', skills['C04_SSR_009S1']['damageTarget'])
        for identifier in ('C01_SR_006S3', 'C02_SR_007S3'):
            self.assertIn('未配置可执行', skills[identifier]['description'])
            self.assertEqual(skills[identifier]['glossaryIds'], [])
        cards = {card['id']: card for card in self.calculator['cards']}
        self.assertNotIn('Shield', cards['C01_SR_006']['glossaryIds'])
        self.assertNotIn('Reflection', cards['C01_SR_006']['glossaryIds'])

    def test_s4_passive_is_resolved_from_enhance_skill(self):
        cards = {card['id']: card for card in self.calculator['cards']}
        for identifier in ('C01_SSR_010', 'C01_SSR_014', 'C02_SSR_001',
                           'C02_SSR_008', 'C04_SSR_002', 'C04_SSR_003', 'C01_SR_007'):
            stage = next(row for row in cards[identifier]['imprint'] if row['LV'] == '3')
            sid = identifier + 'S4'
            self.assertEqual(stage['EnhanceSkill'], sid)
            self.assertEqual(self.calculator['skills'][sid]['raw']['SkillType'], 'Passive')
            self.assertTrue(self.calculator['skills'][sid]['description'])

    def test_regression_guard_detects_empty_and_mismatched_text(self):
        calculator, catalog = deepcopy(self.calculator), deepcopy(self.catalog)
        calculator['skills']['C03_SSR_003S1']['description'] = ''
        calculator['cards'][0]['glossaryIds'] = ['UnknownGlossaryID']
        catalog['cards'][0]['imprint'][2]['EnhanceSkill'] = 'MissingSkill'
        report = audit_published(calculator, catalog)
        self.assertTrue(any('正文为空' in error['error'] for error in report['errors']))
        self.assertTrue(any('两站技能正文不同' in error['error'] for error in report['errors']))
        self.assertTrue(any('未定义词条' in error['error'] for error in report['errors']))
        self.assertTrue(any('强化原字段不同' in error['error'] for error in report['errors']))

    def test_residual_original_bracket_is_removed(self):
        self.assertEqual(clean_text('附加[潜影:Stealth:StatusFun]]( 2 回合)'), '附加潜影( 2 回合)')
        self.assertEqual(clean_text('[炽燃::Burn:StatusFun]'), '炽燃')
        for skill in self.calculator['skills'].values():
            self.assertNotIn('[', skill['description'])
            self.assertNotIn(']', skill['description'])


if __name__ == '__main__':
    unittest.main()
