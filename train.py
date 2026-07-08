import os
import sys
import pandas as pd
from sklearn.ensemble import IsolationForest
import joblib

def main():
    # 데이터 경로 탐색 (현재 폴더 또는 절대 경로)
    current_dir = os.path.dirname(os.path.abspath(__file__))
    data_path = os.path.join(current_dir, 'data3.csv')
    
    if not os.path.exists(data_path):
        data_path = r'c:\Users\user\앤티그래비티\0708학습\data3.csv'
        if not os.path.exists(data_path):
            print(f"[ERROR] 학습 데이터 data3.csv를 찾을 수 없습니다.")
            sys.exit(1)
            
    print(f"[INFO] 학습 데이터 로드 중: {data_path}")
    try:
        df = pd.read_csv(data_path)
    except Exception as e:
        print(f"[ERROR] 데이터를 로드하는 중 오류가 발생했습니다: {e}")
        sys.exit(1)
        
    features = ['Temperature_C', 'Humidity_Percent', 'CO_ppm']
    
    # 필요한 컬럼 검증
    missing_cols = [col for col in features if col not in df.columns]
    if missing_cols:
        print(f"[ERROR] 데이터셋에 필요한 피처 컬럼이 누락되었습니다: {missing_cols}")
        sys.exit(1)
        
    X_train = df[features]
    print(f"[INFO] 학습 데이터 개수: {len(X_train):,}행")
    
    # Isolation Forest 학습
    print("[INFO] Isolation Forest 모델 학습 시작...")
    # contamination 파라미터는 이상치 비율을 정의함 (예: 1%로 설정)
    model = IsolationForest(n_estimators=100, contamination=0.01, random_state=42)
    model.fit(X_train)
    print("[SUCCESS] Isolation Forest 모델 학습 완료!")
    
    # 모델 저장
    model_output_path = os.path.join(current_dir, 'isolation_forest_model.joblib')
    try:
        joblib.dump(model, model_output_path)
        print(f"[SUCCESS] 모델이 성공적으로 저장되었습니다: {model_output_path}")
    except Exception as e:
        print(f"[ERROR] 모델을 저장하는 데 실패했습니다: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
