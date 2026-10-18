"""Inspect paired 014517 client files and execute its original function dispatch.

Requires pyelftools, capstone and unicorn. It never starts or modifies the game.
"""
import argparse
import hashlib
import json
import re
import struct
import zipfile
import io
from pathlib import Path

from capstone import Cs, CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN
from elftools.elf.elffile import ELFFile
from unicorn import Uc, UC_ARCH_ARM64, UC_MODE_ARM, UC_HOOK_CODE
from unicorn.arm64_const import UC_ARM64_REG_X0, UC_ARM64_REG_X3, UC_ARM64_REG_SP


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--research', type=Path, required=True)
    parser.add_argument('--tables', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--apk', type=Path, help='Optional unmodified official APK to cross-check both tables and native binary')
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    binary = args.research / 'libil2cpp_014517.so'
    binary_sha = hashlib.sha256(binary.read_bytes()).hexdigest()
    assert binary_sha == '8dd87b18e1f32041faaa8f32366175afb8044772cbdf3d15ff04413595a75e35', 'This audit uses the paired 014517 binary only'
    dump = (args.research / 'dump_014517/dump.cs').read_text('utf8')
    enums = {name: int(value) for name, value in re.findall(r'public const EFunction (\w+) = (\d+);', dump)}

    def table(name):
        rows = (args.tables / (name + '.txt')).read_text('utf-8-sig').splitlines()
        keys = rows[0].split('@')
        return [dict(zip(keys, row.split('@'))) for row in rows[1:] if row]

    statuses = {row['ID']: row for row in table('status')}
    skill = next(row for row in table('skill') if row['ID'] == 'C03_SSR_012S1')
    raw = skill['DynamicField1']
    candidates = ['Silence', 'Unhealable', 'ReduceAttack', 'ReduceDef']
    assert raw == 'Fun#{Fun:"AddStatus",Rate:0.75,FID:"RandomAddStatus",FIDs:["Silence","Unhealable","ReduceAttack","ReduceDef"],StatusRound:1}'
    assert 'RandomAddStatus' not in statuses
    assert all(status in statuses for status in candidates)
    assert enums['AddStatus'] == 1 and enums['RandomAddStatus'] == 22

    with binary.open('rb') as stream:
        elf = ELFFile(stream)

        def read(address, size):
            for seg in elf.iter_segments():
                if seg['p_type'] == 'PT_LOAD' and seg['p_vaddr'] <= address and address + size <= seg['p_vaddr'] + seg['p_filesz']:
                    stream.seek(seg['p_offset'] + address - seg['p_vaddr'])
                    return stream.read(size)
            raise ValueError('No file-backed segment for ' + hex(address))

        dispatches = []
        for kind in ['AddStatus', 'RandomAddStatus']:
            uc = Uc(UC_ARCH_ARM64, UC_MODE_ARM)
            for address, size in [(0x2351000, 0x8000), (0xD77000, 0x1000)]:
                uc.mem_map(address, size)
                uc.mem_write(address, read(address, size))
            uc.mem_map(0x10000000, 0x1000)
            uc.mem_map(0x20000000, 0x2000)
            uc.mem_write(0x10000020, struct.pack('<I', enums[kind]))
            uc.mem_write(0x10000090, struct.pack('<Q', 0x10000200))
            uc.mem_write(0x100000A0, struct.pack('<Q', 0x10000300))
            uc.reg_write(UC_ARM64_REG_X0, 0x10000000)
            uc.reg_write(UC_ARM64_REG_SP, 0x20001000)
            observed = {}

            def stop_at_entry(machine, address, _size, _user):
                if address in [0x235775C, 0x235154C]:
                    observed['entry'] = hex(address)
                    if address == 0x235775C:
                        observed['forwardedFID'] = hex(machine.reg_read(UC_ARM64_REG_X3))
                    machine.emu_stop()

            uc.hook_add(UC_HOOK_CODE, stop_at_entry)
            uc.emu_start(0x2351358, 0x2358000, timeout=1_000_000, count=100)
            expected = '0x235775c' if kind == 'AddStatus' else '0x235154c'
            assert observed.get('entry') == expected, observed
            if kind == 'AddStatus':
                assert observed['forwardedFID'] == '0x10000200'
            dispatches.append({'Fun': kind, 'enum': enums[kind], **observed})

        decoder = Cs(CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN)
        methods = [
            ('ProcessFuncToRole', 0x2351358, 0x1EC),
            ('AddStatusToRole_FID', 0x2351544, 8),
            ('AddRandomStatusToRole', 0x235154C, 0x254),
            ('AddStatusToRole_ID', 0x235775C, 0x4E8),
            ('GetStatusStaticData', 0x237BABC, 0xB0),
            ('StatusInitPerRow', 0x23862C0, 0xA4),
            ('LoadJsonDataList', 0x2BA858C, 0x108),
            ('LoadJsonData', 0x2BA8018, 0x200),
        ]
        assembly = []
        for name, address, size in methods:
            assembly.append('\n' + name + ' ' + hex(address))
            assembly.extend(f'{ins.address:x}: {ins.mnemonic} {ins.op_str}' for ins in decoder.disasm(read(address, size), address))
        (args.out / 'random_status_native.asm').write_text('\n'.join(assembly) + '\n', 'utf8')

    apk_confirmation = None
    if args.apk:
        import UnityPy
        apk_confirmation = {'name': args.apk.name, 'bytes': args.apk.stat().st_size, 'tables': {}}
        with zipfile.ZipFile(args.apk) as archive:
            for name in ['skill', 'status']:
                paths = [entry for entry in archive.namelist() if '/staticdata/' + name + '.txt_' in entry.lower()]
                assert len(paths) == 1, paths
                environment = UnityPy.load(io.BytesIO(archive.read(paths[0])))
                asset = next(obj.read() for obj in environment.objects if obj.type.name == 'TextAsset')
                text = asset.m_Script if isinstance(asset.m_Script, str) else asset.m_Script.decode('utf8')
                assert text.replace('\r\n', '\n').strip() == (args.tables / (name + '.txt')).read_text('utf8').strip()
                apk_confirmation['tables'][name] = {'bundle': paths[0], 'matchesLocalTable': True}
            assert hashlib.sha256(archive.read('lib/arm64-v8a/libil2cpp.so')).hexdigest() == binary_sha
            apk_confirmation['nativeBinaryMatches'] = True

    report = {
        'version': '1.0.1.014517',
        'libil2cpp_sha256': binary_sha,
        'skill_table_sha256': hashlib.sha256((args.tables / 'skill.txt').read_bytes()).hexdigest(),
        'status_table_sha256': hashlib.sha256((args.tables / 'status.txt').read_bytes()).hexdigest(),
        'skillID': skill['ID'], 'rawConfig': raw,
        'randomStatusDefinitionPresent': False,
        'candidateDefinitions': {key: {field: statuses[key][field] for field in ['ID', 'RoundCount', 'DynamicField1']} for key in candidates},
        'original_binary_dispatches': dispatches,
        'official_apk_confirmation': apk_confirmation,
        'scope': 'Original ARM64 dispatch executed in isolation, not a live game battle.',
    }
    (args.out / 'random_status_native.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', 'utf8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
