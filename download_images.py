import os
import requests

# 클로드가 준 리스트 중 테스트용으로 몇 명만 먼저 해봅시다
players = [
    {"team": "SSG", "name": "김광현"},
    {"team": "SAMSUNG", "name": "원태인"},
    {"team": "HANWHA", "name": "류현진"}
]

def download_player_photos(player_list):
    if not os.path.exists('raw'):
        os.makedirs('raw')
    
    for p in player_list:
        folder_path = f"raw/{p['team']}_{p['name']}"
        if not os.path.exists(folder_path):
            os.makedirs(folder_path)
        
        print(f"--- {p['name']} 사진 수집 시작 (가이드 주소 생성) ---")
        # 실제로는 구글 검색결과 URL을 여기 넣어야 하지만, 
        # 우선 사장님이 해당 폴더에 사진을 넣기 쉽게 폴더만 쫙 만들어 드립니다.
        print(f"폴더 생성 완료: {folder_path}")

if __name__ == "__main__":
    download_player_photos(players)