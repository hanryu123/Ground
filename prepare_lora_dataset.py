import os
from PIL import Image
import glob

# 경로를 안전하게 절대경로로 잡습니다.
base_path = os.path.dirname(os.path.abspath(__file__))
src_dir = os.path.join(base_path, "raw")
out_dir = os.path.join(base_path, "dataset")

if not os.path.exists(out_dir):
    os.makedirs(out_dir)

print(f"🚀 특수문자 격파 모드 가동! 대상: {src_dir}")

# 모든 하위 폴더의 모든 파일을 다 뒤집니다.
all_files = glob.glob(os.path.join(src_dir, "**", "*"), recursive=True)
process_count = 0

for img_path in all_files:
    # 폴더는 건너뛰고 파일만!
    if os.path.isdir(img_path): continue
    
    # 폴더명(선수이름) 추출
    folder_name = os.path.basename(os.path.dirname(img_path))
    if folder_name == "raw": continue
    
    target_folder = os.path.join(out_dir, folder_name)
    if not os.path.exists(target_folder):
        os.makedirs(target_folder)
        
    try:
        with Image.open(img_path) as img:
            img = img.convert("RGB")
            # 파일명을 안전하게 photo_1, photo_2 식으로 변경
            save_path = os.path.join(target_folder, f"img_{process_count}.jpg")
            img.thumbnail((1024, 1024))
            img.save(save_path, "JPEG", quality=95)
            
            # 캡션 생성
            with open(save_path.replace(".jpg", ".txt"), "w") as f:
                f.write(f"{folder_name}, kbo baseball player, professional uniform, sports photography")
            
            print(f"✅ 성공: {folder_name}의 사진 가공 완료")
            process_count += 1
    except Exception:
        # 사진이 아닌 파일은 그냥 조용히 넘어갑니다.
        continue

print(f"\n✨ 총 {process_count}장의 사진을 가공했습니다! dataset 폴더를 확인하세요.")
