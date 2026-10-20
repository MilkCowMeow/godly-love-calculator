"""全量发布正文、共享词典、三星技能精确引用与保护行为回归。"""
from copy import deepcopy
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from audit_client_content import audit_published, load_published
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
