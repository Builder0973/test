# 😴 수면 감지 모니터링 시스템

MediaPipe를 사용한 실시간 눈 감감 감지 및 수면 모니터링 Flask 웹 애플리케이션입니다.

## 기능

- 🎥 **실시간 웹캠 스트리밍**: 고품질 비디오 스트림
- 👁️ **눈 감감 감지**: MediaPipe를 이용한 정확한 눈 상태 감지
- ⏱️ **20초 임계값**: 20초 이상 눈을 감으면 수면으로 판정
- 🔔 **경고 신호**:
  - 🔊 삐 소리 (음성 신호)
  - 🔴 빨간색 점멸 (화면 신호)
- 🎛️ **신호 제어**: 소리와 점멸 기능을 독립적으로 끄고 켤 수 있음
- 📊 **실시간 통계**: 총 시간, 수면 시간, 수면률 실시간 표시
- 📈 **결과 분석**:
  - 상세 수면 기간 로그
  - 그래프 시각화
  - CSV 파일 다운로드
  - 인쇄 기능

## 설치

### 1. Python 환경 설정
```bash
python -m venv venv
source venv/bin/activate  # macOS/Linux
# 또는
venv\Scripts\activate  # Windows
```

### 2. 필요한 패키지 설치
```bash
pip install -r requirements.txt
```

### 3. 웹캠 권한 확인
- macOS: 시스템 환경설정 > 보안 및 개인정보보호 > 카메라에서 Terminal 또는 Python 권한 허용
- Linux: 웹캠 권한 확인
- Windows: 특별 설정 불필요

## 사용 방법

### 1. 애플리케이션 시작
```bash
python app.py
```

### 2. 웹 브라우저에서 접속
```
http://localhost:5000
```

### 3. 사용 방법
1. **시작 버튼** - 모니터링 시작
2. **신호 제어** - 소리와 점멸 신호 온/오프 조절
3. **실시간 통계** - 진행 상황 실시간 확인
4. **중지 버튼** - 모니터링 종료
5. **결과 보기** - 상세 분석 및 통계 확인

## 웹사이트 구조

```
/                   - 메인 페이지 (모니터링 화면)
/results            - 결과 요약 페이지
/video_feed         - 실시간 비디오 스트림
/api/start_recording    - 녹화 시작
/api/stop_recording     - 녹화 중지
/api/status         - 실시간 상태
/api/settings       - 설정 업데이트
```

## 설정

### 눈 감감 감지 민감도 조정
`app.py`에서 다음 값을 수정할 수 있습니다:

```python
settings = {
    'enable_sound': True,           # 소리 신호 활성화
    'enable_flashing': True,        # 점멸 신호 활성화
    'eye_closed_threshold': 0.15,   # EAR 임계값 (낮을수록 민감)
    'sleep_duration_threshold': 20  # 수면 판정 시간 (초)
}
```

## 시스템 요구사항

- Python 3.8 이상
- 웹캠 (내장 또는 외장)
- 최소 4GB RAM
- 1GB 이상의 디스크 공간

## 주의사항

- 밝은 환경에서 최적의 성능 발휘
- 정렬된 얼굴 위치에서 감지 성능이 우수
- 안경이나 선글라스는 감지 정확도에 영향을 줄 수 있음
- 여러 명이 카메라에 보일 경우 가장 가까운 사람만 감지

## 수업 사용 예시

1. 수업 시작 전 시스템 설정
2. 학생이 착석하면 모니터링 시작
3. 음성/점멸 신호는 필요에 따라 활성화/비활성화
4. 수업 종료 후 결과 확인

## 문제 해결

### 웹캠이 인식되지 않음
- macOS: 시스템 환경설정에서 Terminal/Python에 카메라 권한 부여
- 다른 애플리케이션이 웹캠을 사용 중이 아닌지 확인

### 느린 처리 속도
- 해상도를 줄여보기 (app.py에서 resize 값 조정)
- CPU 사용률 확인

### 눈 감감이 감지되지 않음
- 조명 개선
- EAR 임계값 조정 (`eye_closed_threshold` 값 변경)
- 얼굴 위치 확인

## 라이선스

MIT License

## 개발자

Sleep Detection System v1.0
