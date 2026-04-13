from flask import Flask, render_template, Response, request, jsonify
import cv2
import numpy as np
from datetime import datetime
import threading
import json
import time
import os
import urllib.request
import serial

# MediaPipe 임포트
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

app = Flask(__name__)
app.secret_key = 'sleep_detector_secret'

# 카메라 모드 설정 (True: Arduino, False: Webcam)
USE_ARDUINO_CAMERA = False

# Arduino 카메라 설정
ARDUINO_PORT = '/dev/tty.usbmodem1301'
ARDUINO_BAUD = 115200
arduino_serial = None

import subprocess

def kill_process_on_port(port=8000):
    try:
        # lsof로 포트에 연결된 PID 가져오기
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"],  # -t: PID만 출력, -i : 포트
            capture_output=True,
            text=True
        )
        pids = result.stdout.strip().split("\n")
        if not pids or pids == ['']:
            print(f"port {port} 사용중인 프로세스 없음")
            return

        # PID 하나씩 kill
        for pid in pids:
            subprocess.run(["kill", "-9", pid])
            print(f"port {port} quit: PID {pid}")

    except Exception as e:
        print(f"error: {e}")

# 사용 예
# MediaPipe 모델 파일 다운로드
MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
MODEL_PATH = 'face_landmarker.task'

def download_model():
    """MediaPipe 모델 다운로드"""
    if not os.path.exists(MODEL_PATH):
        print(f"model downloading: {MODEL_PATH}")
        try:
            urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
            print("model download complete")
        except Exception as e:
            print(f"model download failed: {e}")
            return False
    return True

def init_face_detector():
    """FaceLandmarker 초기화"""
    try:
        if not download_model():
            return None
        
        base_options = python.BaseOptions(model_asset_path=MODEL_PATH)
        options = vision.FaceLandmarkerOptions(
            base_options=base_options,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
            num_faces=1
        )
        detector = vision.FaceLandmarker.create_from_options(options)
        return detector
    except Exception as e:
        print(f"FaceLandmarker initialization failed: {e}")
        return None

face_detector = init_face_detector()

# 전역 변수
current_frame = None
frame_lock = threading.Lock()

recording_data = {
    'is_recording': False,
    'start_time': None,
    'end_time': None,
    'sleep_periods': [],
    'current_sleep_start': None,
    'eyes_closed_start': None,
    'is_sleeping': False,
    'total_sleep_seconds': 0,
    'frame_count': 0
}

settings = {
    'enable_sound': True,
    'enable_flashing': True,
    'eye_closed_threshold': 0.20,  # EAR threshold (낮을수록 감지하기 쉬움)
    'sleep_duration_threshold': 20  # seconds
}

# 눈의 랜드마크 인덱스 (EAR 계산용 - 6개 포인트: P1, P2, P3, P4, P5, P6)
# MediaPipe 얼굴 메시 486개 포인트
# 왼쪽 눈 (순서: 좌, 상단좌, 상단우, 우하, 하단우, 하단좌)
LEFT_EYE_EAR = [362, 385, 387, 386, 374, 380]
# 오른쪽 눈 (순서: 좌, 상단좌, 상단우, 우하, 하단우, 하단좌)
RIGHT_EYE_EAR = [33, 160, 158, 133, 145, 144]

# 전체 눈 그리기용 랜드마크
LEFT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]
RIGHT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]

def calculate_eye_aspect_ratio(landmarks, eye_indices):
    """눈의 종횡비(EAR) 계산"""
    if not landmarks or len(landmarks) == 0:
        return 0.0  # 얼굴 없을 때는 눈이 떠있다고 가정
    
    try:
        # 표준 EAR 계산 방식
        # eye_indices는 특정 순서로 정렬되어야 함
        eye_points = np.array([[landmarks[i].x, landmarks[i].y] for i in eye_indices])
        
        # P2-P6 수직 거리
        dist1 = np.linalg.norm(eye_points[1] - eye_points[5])
        # P3-P5 수직 거리  
        dist2 = np.linalg.norm(eye_points[2] - eye_points[4])
        # P1-P4 수평 거리
        dist3 = np.linalg.norm(eye_points[0] - eye_points[3])
        
        # EAR = (||P2 - P6|| + ||P3 - P5||) / (2 * ||P1 - P4||)
        if dist3 > 0:
            ear = (dist1 + dist2) / (2.0 * dist3)
        else:
            ear = 0
        
        return ear
    except Exception as e:
        print(f"EAR 계산 오류: {e}")
        return 1.0

def is_eyes_closed(landmarks):
    """양쪽 눈이 감겼는지 판단"""
    if not landmarks:
        return False
    
    try:
        left_ear = calculate_eye_aspect_ratio(landmarks, LEFT_EYE_EAR)
        right_ear = calculate_eye_aspect_ratio(landmarks, RIGHT_EYE_EAR)
        
        avg_ear = (left_ear + right_ear) / 2.0
        threshold = settings['eye_closed_threshold']
        
        # 임시 디버깅 (첫 번째만 출력)
        if recording_data['frame_count'] < 30:
            pass
            # print(f"L_EAR: {left_ear:.3f}, R_EAR: {right_ear:.3f}, AVG: {avg_ear:.3f}, THR: {threshold:.3f}, Closed: {avg_ear < threshold}")
        
        return avg_ear < threshold
    except Exception as e:
        print(f"눈 감김 판단 오류: {e}")
        return False

def draw_eye_landmarks(frame, landmarks, eye_indices, color):
    """눈의 랜드마크 그리기"""
    h, w, c = frame.shape
    points = []
    
    for idx in eye_indices:
        x = int(landmarks[idx].x * w)
        y = int(landmarks[idx].y * h)
        points.append([x, y])
    
    if points:
        pts = np.array(points, dtype=np.int32)
        cv2.polylines(frame, [pts], True, color, 2)

def init_arduino_serial():
    """Arduino 시리얼 연결 초기화"""
    global arduino_serial
    try:
        if arduino_serial is None or not arduino_serial.is_open:
            arduino_serial = serial.Serial(ARDUINO_PORT, ARDUINO_BAUD, timeout=2)
            print(f"Arduino connection established: {ARDUINO_PORT}")
        return True
    except Exception as e:
        print(f"✗ Arduino connection failed: {e}")
        return False

def read_arduino_frame():
    """Arduino 카메라에서 프레임 읽기"""
    global arduino_serial
    try:
        if arduino_serial is None or not arduino_serial.is_open:
            return None
        
        # 프레임 시작 신호 대기 (0xaa 0xbb)
        while True:
            byte = arduino_serial.read(1)
            if byte == b'\xaa':
                if arduino_serial.read(1) == b'\xbb':
                    break
        
        # 프레임 길이 읽기 (3바이트)
        len_bytes = arduino_serial.read(3)
        if len(len_bytes) < 3:
            return None
        
        img_len = (len_bytes[0] << 16) | (len_bytes[1] << 8) | len_bytes[2]
        
        if img_len == 0 or img_len > 100000:
            return None
        
        # 이미지 데이터 읽기
        data = arduino_serial.read(img_len)
        if len(data) < img_len:
            return None
        
        # 프레임 끝 신호 읽기 (2바이트)
        arduino_serial.read(2)
        
        # JPEG 디코딩
        nparr = np.frombuffer(data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        return img
    except Exception as e:
        print(f"Arduino frame read error: {e}")
        return None

def process_frame(frame):
    """프레임 처리"""
    global recording_data, face_detector
    
    if face_detector is None:
        cv2.putText(frame, "Model Not Loaded", (10, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        return frame
    
    h, w, c = frame.shape
    
    # BGR을 RGB로 변환
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    
    # MediaPipe Image 생성
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
    
    # 얼굴 랜드마크 감지
    detection_result = face_detector.detect(mp_image)
    
    output_frame = frame.copy()
    is_sleeping_now = False
    
    if detection_result.face_landmarks:
        landmarks = detection_result.face_landmarks[0]
        
        # 눈 감감 판단
        is_sleeping_now = is_eyes_closed(landmarks)
        
        # 눈 그리기
        left_color = (0, 0, 255) if is_sleeping_now else (0, 255, 0)
        right_color = (0, 0, 255) if is_sleeping_now else (0, 255, 0)
        
        draw_eye_landmarks(output_frame, landmarks, LEFT_EYE, left_color)
        draw_eye_landmarks(output_frame, landmarks, RIGHT_EYE, right_color)
    else:
        # 얼굴이 감지되지 않으면 sleeping 상태로 간주
        is_sleeping_now = True
        cv2.putText(output_frame, "No Face Detected", (10, 60), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
    
    # 수면 상태 업데이트
    current_time = datetime.now()
    
    if recording_data['is_recording']:
        if is_sleeping_now:
            # 눈이 감긴 상태 또는 얼굴이 감지되지 않은 상태
            if recording_data['eyes_closed_start'] is None:
                recording_data['eyes_closed_start'] = current_time
            
            eyes_closed_duration = (current_time - recording_data['eyes_closed_start']).total_seconds()
            
            # 얼굴이 감지되지 않으면 즉시 수면 상태로 전환
            # 얼굴이 감지되면 threshold 시간 후 수면 상태로 전환
            should_sleep = (eyes_closed_duration >= settings['sleep_duration_threshold']) or \
                          (not detection_result.face_landmarks)
            
            if should_sleep and not recording_data['is_sleeping']:
                # 수면 시작
                recording_data['is_sleeping'] = True
                recording_data['current_sleep_start'] = recording_data['eyes_closed_start']
        else:
            # 눈이 떠있는 상태
            if recording_data['is_sleeping']:
                # 수면 종료
                recording_data['is_sleeping'] = False
                if recording_data['current_sleep_start']:
                    sleep_duration = (current_time - recording_data['current_sleep_start']).total_seconds()
                    recording_data['sleep_periods'].append({
                        'start': recording_data['current_sleep_start'].isoformat(),
                        'end': current_time.isoformat(),
                        'duration': sleep_duration
                    })
                    recording_data['total_sleep_seconds'] += sleep_duration
            
            recording_data['eyes_closed_start'] = None
    
    # 상태 표시
    if recording_data['is_recording']:
        elapsed = (current_time - recording_data['start_time']).total_seconds()
        mins = int(elapsed // 60)
        secs = int(elapsed % 60)
        
        status_text = f"Status: {'SLEEPING' if recording_data['is_sleeping'] else '✅ AWAKE'} | {mins:02d}:{secs:02d}"
        
        # 20초 카운트다운 표시
        if is_sleeping_now and recording_data['eyes_closed_start']:
            eyes_closed_dur = (current_time - recording_data['eyes_closed_start']).total_seconds()
            countdown = max(0, int(settings['sleep_duration_threshold'] - eyes_closed_dur))
            status_text += f" | {countdown}s"
        
        # 빨간 점멸
        if recording_data['is_sleeping'] and settings['enable_flashing']:
            flash_state = int((elapsed * 2) % 2)
            if flash_state == 0:
                # 빨간색 오버레이 추가
                red_overlay = np.zeros_like(output_frame, dtype=np.uint8)
                red_overlay[:,:] = (0, 0, 255)
                output_frame = cv2.addWeighted(output_frame, 0.6, red_overlay, 0.4, 0)
    else:
        status_text = "READY | Click START"
    
    # 상태 텍스트 표시
    cv2.putText(output_frame, status_text, (10, 30), 
               cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    
    recording_data['frame_count'] += 1
    return output_frame

def generate_frames():
    """비디오 스트림 생성 (Arduino 카메라 또는 웹캠)"""
    global current_frame, recording_data, USE_ARDUINO_CAMERA
    
    try:
        # Arduino 모드 선택
        if USE_ARDUINO_CAMERA:
            if not init_arduino_serial():
                print("Arduino camera initialization failed, switching to webcam")
                USE_ARDUINO_CAMERA = False
                # Fallback to webcam
                yield from _generate_webcam_frames()
                return
            
            # Arduino 카메라 모드
            print("🎥 Arduino camera mode")
            yield from _generate_arduino_frames()
        else:
            # 웹캠 모드
            print("Webcam mode")
            yield from _generate_webcam_frames()
    
    except Exception as e:
        print(f"Frame generation error: {e}")
    finally:
        if arduino_serial and arduino_serial.is_open:
            arduino_serial.close()
            print("Arduino connection closed")

def _generate_arduino_frames():
    """Arduino 카메라로부터 프레임 생성"""
    global current_frame, arduino_serial

    print("Arduino camera mode")
    while True:
        frame = read_arduino_frame()
        
        if frame is None:
            continue
        
        # 프레임 처리
        processed_frame = process_frame(frame)
        
        with frame_lock:
            current_frame = processed_frame.copy()
        
        # JPEG 인코딩
        ret, buffer = cv2.imencode('.jpg', processed_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if not ret:
            continue
        
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        
        time.sleep(0.01)

def _generate_webcam_frames():
    """웹캠으로부터 프레임 생성"""
    global current_frame
    
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Can not open webcam")
        while True:
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cv2.putText(frame, "No Camera Available", (150, 240), 
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if ret:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
            time.sleep(0.5)
        return
    
    # 카메라 설정
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS, 20)

    print("Receiving frames from webcam...")
    while True:
        success, frame = cap.read()
        if not success:
            break
        
        frame = cv2.flip(frame, 1)
        processed_frame = process_frame(frame)
        
        with frame_lock:
            current_frame = processed_frame.copy()
        
        ret, buffer = cv2.imencode('.jpg', processed_frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if not ret:
            continue
        
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
        time.sleep(0.01)
    
    cap.release()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), 
                   mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/start_recording', methods=['POST'])
def start_recording():
    global recording_data
    
    recording_data = {
        'is_recording': True,
        'start_time': datetime.now(),
        'end_time': None,
        'sleep_periods': [],
        'current_sleep_start': None,
        'eyes_closed_start': None,
        'is_sleeping': False,
        'total_sleep_seconds': 0,
        'frame_count': 0
    }
    
    return jsonify({'status': 'started', 'start_time': recording_data['start_time'].isoformat()})

@app.route('/api/stop_recording', methods=['POST'])
def stop_recording():
    global recording_data
    
    if recording_data['is_recording']:
        recording_data['is_recording'] = False
        recording_data['end_time'] = datetime.now()
        
        if recording_data['is_sleeping'] and recording_data['current_sleep_start']:
            sleep_duration = (recording_data['end_time'] - recording_data['current_sleep_start']).total_seconds()
            recording_data['sleep_periods'].append({
                'start': recording_data['current_sleep_start'].isoformat(),
                'end': recording_data['end_time'].isoformat(),
                'duration': sleep_duration
            })
            recording_data['total_sleep_seconds'] += sleep_duration
    
    return jsonify(get_recording_summary())

@app.route('/api/status', methods=['GET'])
def get_status():
    global recording_data, USE_ARDUINO_CAMERA
    
    status = {
        'is_recording': recording_data['is_recording'],
        'is_sleeping': recording_data['is_sleeping'],
        'settings': settings,
        'camera_mode': 'Arduino' if USE_ARDUINO_CAMERA else 'Webcam'
    }
    
    if recording_data['is_recording'] and recording_data['start_time']:
        elapsed = (datetime.now() - recording_data['start_time']).total_seconds()
        status['elapsed_time'] = elapsed
        status['total_sleep_seconds'] = recording_data['total_sleep_seconds']
    
    return jsonify(status)

@app.route('/api/switch_camera', methods=['POST'])
def switch_camera():
    """카메라 모드 전환 (Arduino <-> Webcam)"""
    global USE_ARDUINO_CAMERA
    
    data = request.json
    if 'mode' in data:
        mode = data['mode'].lower()
        if mode == 'arduino':
            USE_ARDUINO_CAMERA = True
            message = "Switching to Arduino camera mode"
        elif mode == 'webcam':
            USE_ARDUINO_CAMERA = False
            message = "Switching to webcam mode"
        else:
            return jsonify({'status': 'error', 'message': 'Invalid mode'}), 400
    else:
        # 토글
        USE_ARDUINO_CAMERA = not USE_ARDUINO_CAMERA
        message = f"{'Arduino' if USE_ARDUINO_CAMERA else '📷 Webcam'} 모드로 전환"
    
    # print(message)
    return jsonify({
        'status': 'success', 
        'message': message,
        'current_mode': 'Arduino' if USE_ARDUINO_CAMERA else 'Webcam'
    })

@app.route('/api/settings', methods=['POST'])
def update_settings():
    global settings
    
    data = request.json
    if 'enable_sound' in data:
        settings['enable_sound'] = data['enable_sound']
    if 'enable_flashing' in data:
        settings['enable_flashing'] = data['enable_flashing']
    
    return jsonify({'status': 'updated', 'settings': settings})

@app.route('/api/update_threshold', methods=['POST'])
def update_threshold():
    global settings
    
    data = request.json
    if 'sleep_duration_threshold' in data:
        settings['sleep_duration_threshold'] = int(data['sleep_duration_threshold'])
    if 'eye_closed_threshold' in data:
        settings['eye_closed_threshold'] = float(data['eye_closed_threshold'])
    
    return jsonify({'status': 'updated', 'settings': settings})

def get_recording_summary():
    """기록 요약 생성"""
    if not recording_data['start_time'] or not recording_data['end_time']:
        return {}
    
    total_duration = (recording_data['end_time'] - recording_data['start_time']).total_seconds()
    sleep_percentage = (recording_data['total_sleep_seconds'] / total_duration * 100) if total_duration > 0 else 0
    
    summary = {
        'start_time': recording_data['start_time'].isoformat(),
        'end_time': recording_data['end_time'].isoformat(),
        'total_duration': total_duration,
        'total_sleep_seconds': recording_data['total_sleep_seconds'],
        'sleep_percentage': round(sleep_percentage, 2),
        'sleep_periods': recording_data['sleep_periods'],
        'awake_percentage': round(100 - sleep_percentage, 2)
    }
    
    return summary

@app.route('/api/results', methods=['GET'])
def get_results():
    return jsonify(get_recording_summary())

@app.route('/results')
def results():
    summary = get_recording_summary()
    return render_template('results.html', summary=json.dumps(summary))

if __name__ == '__main__':
    port = 8000
    print("\n" + "="*60)
    print("sleep detector monitoring system")
    print("="*60)
    print(f"url : http://localhost:{port}")
    print("stop server: Ctrl+C")
    print("="*60 + "\n")


    kill_process_on_port(port)

    app.run(debug=False, host='0.0.0.0', port=port, threaded=True, use_reloader=False)
