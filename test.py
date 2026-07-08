import os
import sys
import argparse
import pandas as pd
import numpy as np
import joblib
from dotenv import load_dotenv
from supabase import create_client

class HybridAnomalyDetector:
    def __init__(self, model):
        self.model = model

    def predict_status(self, temp, humid, co):
        """
        하이브리드 알고리즘 판정 기준:
        - 0: 정상 (온도가 40도 미만이고 이상치 알고리즘에서 정상 판정)
        - 1: 경고 (온도가 40도 이상이고 이상치 알고리즘에서 정상 판정)
        - 2: 위험 (이상치 알고리즘에서 이상치로 판정)
        
        * 이상치 알고리즘(Isolation Forest) 결과: 1 (정상), -1 (이상치)
        """
        # 입력값을 데이터프레임 형식으로 변환
        features = ['Temperature_C', 'Humidity_Percent', 'CO_ppm']
        input_data = pd.DataFrame([[temp, humid, co]], columns=features)
        
        # Isolation Forest 예측
        try:
            pred = self.model.predict(input_data)[0]
        except Exception as e:
            print(f"[ERROR] 모델 예측 중 오류가 발생했습니다: {e}")
            return -1
        
        # 판정 로직 적용
        is_anomaly = (pred == -1)
        temp_high = (temp >= 40.0)
        
        if is_anomaly:
            # 위험 (온도가 40이상이면서 이상치로 판정된 경우도 여기에 해당)
            return 2
        elif temp_high:
            # 경고
            return 1
        else:
            # 정상
            return 0

def main():
    parser = argparse.ArgumentParser(description="하이브리드 이상 탐지 테스트 프로그램")
    parser.add_argument('--temp', type=float, help="온도 값 (Temperature_C)")
    parser.add_argument('--humid', type=float, help="습도 값 (Humidity_Percent)")
    parser.add_argument('--co', type=float, help="CO 농도 값 (CO_ppm)")
    args = parser.parse_args()

    # 모델 경로 탐색 (현재 폴더 또는 절대 경로)
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    # .env 파일 로드 및 Supabase 클라이언트 초기화
    env_path = os.path.join(current_dir, '.env')
    load_dotenv(env_path)
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_KEY")
    supabase = None
    
    if supabase_url and supabase_key:
        try:
            supabase = create_client(supabase_url, supabase_key)
            print("[SUCCESS] Supabase 클라이언트 연결 성공!")
        except Exception as e:
            print(f"[WARNING] Supabase 연결 실패: {e}")
    else:
        print("[WARNING] .env 파일에 Supabase 환경 변수가 없습니다.")

    # 저장 헬퍼 함수 정의
    def save_to_supabase(temp, humid, co, status):
        if supabase is None:
            return
        try:
            db_data = {
                'temperature_c': temp,
                'humidity_percent': humid,
                'co_ppm': co,
                'status_code': status
            }
            supabase.table('sensor_logs2').insert(db_data).execute()
            print("[INFO] Supabase 테이블(sensor_logs2)에 로그가 저장되었습니다.")
        except Exception as e:
            print(f"[ERROR] Supabase 데이터 저장 중 오류 발생: {e}")

    model_path = os.path.join(current_dir, 'isolation_forest_model.joblib')
    
    if not os.path.exists(model_path):
        model_path = r'c:\Users\user\앤티그래비티\0708학습\isolation_forest_model.joblib'
        if not os.path.exists(model_path):
            print(f"[ERROR] 학습된 모델 파일을 찾을 수 없습니다: {model_path}")
            print("[INFO] 먼저 train.py를 실행하여 모델을 학습시켜 주세요.")
            sys.exit(1)

    print(f"[INFO] 모델 로드 중: {model_path}")
    try:
        model = joblib.load(model_path)
        detector = HybridAnomalyDetector(model)
        print("[SUCCESS] 모델 로드 완료!")
    except Exception as e:
        print(f"[ERROR] 모델 로드 실패: {e}")
        sys.exit(1)

    # 1. 아규먼트 입력 처리
    if args.temp is not None and args.humid is not None and args.co is not None:
        status = detector.predict_status(args.temp, args.humid, args.co)
        status_map = {0: "정상 (0)", 1: "경고 (1)", 2: "위험 (2)"}
        print(f"\n[입력 데이터] 온도: {args.temp}°C, 습도: {args.humid}%, CO: {args.co} ppm")
        print(f"[판정 결과] {status_map.get(status, '오류 (-1)')}")
        save_to_supabase(args.temp, args.humid, args.co, status)
        return

    # 2. 대화형(Interactive) 입력 루프 처리
    print("\n" + "=" * 50)
    print("실시간 하이브리드 이상 탐지 테스트 콘솔")
    print("온도, 습도, CO 농도를 차례대로 입력해 주세요. (종료하려면 'q' 입력)")
    print("=" * 50)

    while True:
        try:
            temp_in = input("\n온도(Temperature_C) 입력 (종료: q): ").strip()
            if temp_in.lower() == 'q':
                print("[INFO] 프로그램을 종료합니다.")
                break
            temp = float(temp_in)
            
            humid_in = input("습도(Humidity_Percent) 입력: ").strip()
            humid = float(humid_in)
            
            co_in = input("CO농도(CO_ppm) 입력: ").strip()
            co = float(co_in)
            
            status = detector.predict_status(temp, humid, co)
            
            status_map = {0: "정상 (0)", 1: "경고 (1)", 2: "위험 (2)"}
            print(f"=> 판정 결과: {status_map.get(status, '오류 (-1)')}")
            save_to_supabase(temp, humid, co, status)
            print("-" * 50)
            
        except ValueError:
            print("[ERROR] 숫자를 입력해 주시거나 종료하려면 'q'를 입력하세요.")
            print("-" * 50)

if __name__ == '__main__':
    main()
