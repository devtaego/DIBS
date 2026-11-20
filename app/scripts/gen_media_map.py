"""public/ 아래 표지·원고·쇼츠를 네이티브 앱에 넣는 맵(src/lib/media.native.ts)을 만든다.

    python3 scripts/gen_media_map.py

웹은 public/ 파일을 주소로 불러오고(src/lib/media.ts), iOS·Android(Expo Go)는 이 맵의 require 로 번들한다.
public/ 에 파일을 추가하면 다시 실행할 것.
"""
import pathlib

APP = pathlib.Path(__file__).resolve().parent.parent
PUB = APP / "public"
files = sorted(p.relative_to(PUB).as_posix() for d in ("covers", "episodes", "shorts") for p in (PUB / d).glob("*") if p.is_file())
lines = [
    "// 자동 생성: python3 scripts/gen_media_map.py (직접 고치지 말 것)",
    "// iOS·Android 에서는 public/ 의 데모 미디어를 앱에 번들한다. 웹은 media.ts 가 주소로 불러온다.",
    "import type { ImageSourcePropType } from 'react-native';",
    "",
    "const BUNDLED: Record<string, number> = {",
    *[f"  '{f}': require('../../public/{f}')," for f in files],
    "};",
    "",
    "/** 이미지 소스. 번들된 데모 파일이면 require 자산, http(s) 주소면 그대로, 그 밖에는 없음 */",
    "export function imageSource(path?: string | null): ImageSourcePropType | undefined {",
    "  if (!path) return undefined;",
    "  if (BUNDLED[path] != null) return BUNDLED[path];",
    "  return /^https?:\\/\\//.test(path) ? { uri: path } : undefined;",
    "}",
    "",
    "/** 영상 소스 (expo-video). 재생할 수 없으면 null */",
    "export function videoSource(path?: string | null): number | string | null {",
    "  if (!path) return null;",
    "  if (BUNDLED[path] != null) return BUNDLED[path];",
    "  return /^https?:\\/\\//.test(path) && !/cdn\\.example\\//.test(path) ? path : null;",
    "}",
    "",
]
(APP / "src/lib/media.native.ts").write_text("\n".join(lines), encoding="utf-8")
print(f"{len(files)}개 파일 → src/lib/media.native.ts")
