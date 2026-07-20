# ComfyUI-RangeToString

A custom node for [ComfyUI](https://github.com/comfyanonymous/ComfyUI) that generates a string of numbers between a start and end value.  
Supports positive and negative steps, configurable separators, and inclusive/exclusive end values.

<img width="487" height="334" alt="image" src="https://github.com/user-attachments/assets/6db49630-deb1-4e8b-a821-9e1ab936fe64" />

---

## Features
- Generate ranges as a string (comma-separated by default, but custom separator allowed)
- Inclusive or exclusive end value
- Supports ascending and descending ranges (positive or negative step)
- Lightweight, no additional dependencies

---

## 1. Installation
1. Clone or download this repository into your `ComfyUI/custom_nodes/` directory:
   ```bashcd
   git clone https://github.com/dehypnotic/comfyui-range-to-string.git
3. Restart ComfyUI.

### 2. Installation via ComfyUI Manager
> ⚠ Note: Installing via Manager requires that your `security_level` in `config.ini` is set to `weak` (default is `high`), due to external URL restrictions.

1. Set `security_level = weak` in `ComfyUI\user\default\ComfyUI-Manager\config.ini`
2. Open ComfyUI Manager → Install from URL
3. Paste the repository URL:  
   `https://github.com/Dehypnotic/comfyui-range-to-string.git`
4. Press **Install** and restart ComfyUI if necessary.

---

## Usage Examples

| Start | End | Step | Separator | Mode       | Output       |
|-------|-----|------|-----------|------------|--------------|
| 0     | 5   | 1    | ,         | inclusive  | 0,1,2,3,4,5  |
| 0     | 5   | 1    | ,         | exclusive  | 0,1,2,3,4    |
| 5     | 0   | -1   | ,         | inclusive  | 5,4,3,2,1,0  |
| 5     | 0   | -1   | ;         | exclusive  | 5;4;3;2;1    |


<img width="933" height="375" alt="image" src="https://github.com/user-attachments/assets/97a127f8-28e4-4254-a564-42fc92422170" />

---

## License
MIT License – feel free to use, modify, and share.
