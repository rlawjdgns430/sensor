import os
import sys
import argparse
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import IsolationForest

class H:
    def __init__(self, isolation_forest_model, co_threshold=50.0):
        """
        Hybrid Anomaly Detector combining Isolation Forest and rule-based thresholds.
        
        Parameters:
        -----------
        isolation_forest_model : sklearn.ensemble.IsolationForest
            Trained Isolation Forest model.
        co_threshold : float
            CO threshold to force anomaly status (default: 50.0).
        """
        self.model = isolation_forest_model
        self.co_threshold = co_threshold

    def predict_anomaly(self, X):
        """
        Predict binary anomaly status (-1: Anomaly, 1: Normal) 
        using Hybrid logic (Isolation Forest + CO threshold rule).
        """
        # Isolation Forest prediction
        preds = self.model.predict(X)
        
        # Rule-based overrides: Force to anomaly (-1) if CO exceeds threshold
        co_values = X['CO_ppm'].values
        co_rule_violated = co_values >= self.co_threshold
        
        preds[co_rule_violated] = -1
        return preds

    def judge_status(self, X):
        """
        Judge the status into 3 levels:
        - 2 (Danger / 위험): Detected as anomaly (-1) by the hybrid algorithm.
        - 1 (Warning / 경고): Temperature is 40 or higher, but the hybrid algorithm considers it normal (1).
        - 0 (Normal / 정상): Temperature is below 40 and the hybrid algorithm considers it normal (1).
        """
        # Get binary anomaly predictions
        anomalies = self.predict_anomaly(X)
        temps = X['Temperature_C'].values
        
        status = np.zeros(len(X), dtype=int)
        
        for i in range(len(X)):
            is_anomaly = (anomalies[i] == -1)
            temp_high = (temps[i] >= 40.0)
            
            if is_anomaly:
                status[i] = 2  # 위험
            elif temp_high:
                status[i] = 1  # 경고
            else:
                status[i] = 0  # 정상
                
        return status

def main():
    parser = argparse.ArgumentParser(description="하이브리드 알고리즘 화재/이상 탐지 프로그램")
    parser.add_argument('--non-interactive', action='store_true', help="실시간 사용자 입력 루프를 건너뜁니다.")
    args = parser.parse_args()

    # 데이터 경로
    data_path = r'c:\Users\user\앤티그래비티\0708학습\data3.csv'
    if not os.path.exists(data_path):
        print(f"[ERROR] 데이터를 찾을 수 없습니다: {data_path}")
        sys.exit(1)
        
    print(f"[INFO] 데이터 로드 중: {data_path}")
    df = pd.read_csv(data_path)
    
    # 학습에 사용할 피처 선택
    features = ['Temperature_C', 'Humidity_Percent', 'CO_ppm']
    X = df[features]
    
    # 1. 학습/테스트 데이터 분할 (8:2)
    print("[INFO] 학습용 및 테스트용 데이터 분할 중 (8:2)...")
    X_train, X_test = train_test_split(X, test_size=0.2, random_state=42)
    print(f"학습 데이터 개수: {len(X_train):,}행")
    print(f"테스트 데이터 개수: {len(X_test):,}행")
    
    # 2. Isolation Forest 모델 학습
    print("[INFO] Isolation Forest 모델 학습 진행 중...")
    if_model = IsolationForest(n_estimators=100, contamination=0.01, random_state=42)
    if_model.fit(X_train)
    print("[SUCCESS] Isolation Forest 모델 학습 완료!")
    
    # 3. 하이브리드 탐지 모델 생성 (CO 임계값 기본 50.0 ppm 적용)
    detector = HybridAnomalyDetector(isolation_forest_model=if_model, co_threshold=50.0)
    
    # 4. 테스트 데이터셋 상태 판정 및 집계
    print("[INFO] 테스트 데이터에 대한 3단계 상태 판정 중...")
    test_status = detector.judge_status(X_test)
    
    unique_vals, counts = np.unique(test_status, return_counts=True)
    status_counts = dict(zip(unique_vals, counts))
    
    print("\n================ [테스트 결과 집계] ================")
    print(f"[정상] (0): {status_counts.get(0, 0):,}개")
    print(f"[경고] (1): {status_counts.get(1, 0):,}개")
    print(f"[위험] (2): {status_counts.get(2, 0):,}개")
    print("===================================================\n")
    
    # 5. 실시간 사용자 입력 테스트 루프
    if args.non_interactive:
        print("[INFO] --non-interactive 옵션이 감지되어 실시간 입력 루프를 종료합니다.")
        return
        
    print("================ [실시간 상태 판정 콘솔] ================")
    print("온도, 습도, CO 농도를 입력하여 상태를 판별합니다. (종료하려면 'q' 입력)")
    
    while True:
        try:
            temp_in = input("온도(Temperature_C) 입력 (종료: q): ").strip()
            if temp_in.lower() == 'q':
                print("[INFO] 프로그램을 종료합니다.")
                break
            temp = float(temp_in)
            
            humid_in = input("습도(Humidity_Percent) 입력: ").strip()
            humid = float(humid_in)
            
            co_in = input("CO농도(CO_ppm) 입력: ").strip()
            co = float(co_in)
            
            # 입력값 데이터프레임 변환
            input_df = pd.DataFrame([[temp, humid, co]], columns=features)
            
            # 3단계 판정
            status = detector.judge_status(input_df)[0]
            
            status_map = {0: "[정상] (0)", 1: "[경고] (1)", 2: "[위험] (2)"}
            print(f"=> 판정 결과: {status_map[status]}")
            print("-" * 50)
            
        except ValueError:
            print("[ERROR] 올바른 숫자를 입력해 주세요.")
            print("-" * 50)

if __name__ == '__main__':
    main()
