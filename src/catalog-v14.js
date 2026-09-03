const CATEGORY_ROWS = [
  ["cat_wireless", "Kablosuz & Haberleşme", "kablosuz-haberlesme", "antenna"],
  ["cat_led", "LED & Aydınlatma", "led-aydinlatma", "led"],
  ["cat_passive", "Pasif Bileşenler", "pasif-bilesenler", "resistor"],
  ["cat_ic", "Entegre & Yarı İletken", "entegre-yari-iletken", "chip"],
  ["cat_connectors", "Kablo & Konnektör", "kablo-konnektor", "plug"],
  ["cat_battery", "Pil & Şarj", "pil-sarj", "battery"],
  ["cat_robotics", "Robotik & Mekanik", "robotik-mekanik", "robot"],
  ["cat_audio", "Ses & Buzzer", "ses-buzzer", "speaker"],
  ["cat_measurement", "Ölçüm & Lehimleme", "olcum-lehimleme", "meter"],
];

const PRODUCT_ROWS = `
prd_v14_esp32_s3_devkitc	ESP32-S3-DEVKITC	ESP32-S3 DevKitC-1	Espressif	cat_boards
prd_v14_esp32_c3_supermini	ESP32-C3-SUPERMINI	ESP32-C3 SuperMini USB-C	Espressif uyumlu	cat_boards
prd_v14_esp32_c6_devkit	ESP32-C6-DEVKIT	ESP32-C6 DevKitC Wi‑Fi 6 + BLE	Espressif	cat_boards
prd_v14_esp32_s2_mini	ESP32-S2-MINI	ESP32-S2 Mini USB-C	Espressif uyumlu	cat_boards
prd_v14_esp32_s3_zero	ESP32-S3-ZERO	ESP32-S3 Zero Mini Geliştirme Kartı	Waveshare uyumlu	cat_boards
prd_v14_ard_uno_r4_minima	ARD-UNO-R4-MINIMA	Arduino UNO R4 Minima	Arduino	cat_boards
prd_v14_ard_uno_r4_wifi	ARD-UNO-R4-WIFI	Arduino UNO R4 WiFi	Arduino	cat_boards
prd_v14_ard_nano_esp32	ARD-NANO-ESP32	Arduino Nano ESP32	Arduino	cat_boards
prd_v14_ard_nano_every	ARD-NANO-EVERY	Arduino Nano Every	Arduino	cat_boards
prd_v14_ard_leonardo	ARD-LEONARDO	Arduino Leonardo R3 Uyumlu Kart	Arduino uyumlu	cat_boards
prd_v14_ard_micro	ARD-MICRO	Arduino Micro ATmega32U4 Uyumlu	Arduino uyumlu	cat_boards
prd_v14_rpi_pico2	RPI-PICO2	Raspberry Pi Pico 2 RP2350	Raspberry Pi	cat_boards
prd_v14_rpi_pico2w	RPI-PICO2W	Raspberry Pi Pico 2 W	Raspberry Pi	cat_boards
prd_v14_stm32_bluepill	STM32-BLUEPILL	STM32F103C8T6 Blue Pill	STMicroelectronics uyumlu	cat_boards
prd_v14_stm32_blackpill_f411	STM32-BLACKPILL-F411	STM32F411CEU6 Black Pill	WeAct uyumlu	cat_boards
prd_v14_xiao_esp32c3	XIAO-ESP32C3	Seeed Studio XIAO ESP32C3	Seeed Studio	cat_boards
prd_v14_xiao_rp2040	XIAO-RP2040	Seeed Studio XIAO RP2040	Seeed Studio	cat_boards
prd_v14_attiny85_digispark	ATTINY85-DIGISPARK	Digispark ATtiny85 USB Geliştirme Kartı	Digispark uyumlu	cat_boards
prd_v14_sns_bme280	SNS-BME280	BME280 Sıcaklık Nem Basınç Sensörü	Bosch uyumlu	cat_sensors
prd_v14_sns_bme680	SNS-BME680	BME680 Hava Kalitesi Sensörü	Bosch uyumlu	cat_sensors
prd_v14_sns_aht20	SNS-AHT20	AHT20 Dijital Sıcaklık ve Nem Sensörü	ASAIR uyumlu	cat_sensors
prd_v14_sns_sht31	SNS-SHT31	SHT31-D Sıcaklık ve Nem Sensörü	Sensirion uyumlu	cat_sensors
prd_v14_sns_vl53l0x	SNS-VL53L0X	VL53L0X ToF Lazer Mesafe Sensörü	STMicroelectronics uyumlu	cat_sensors
prd_v14_sns_vl53l1x	SNS-VL53L1X	VL53L1X ToF Mesafe Sensörü	STMicroelectronics uyumlu	cat_sensors
prd_v14_sns_bh1750	SNS-BH1750	BH1750 Dijital Işık Sensörü	ROHM uyumlu	cat_sensors
prd_v14_sns_tcs34725	SNS-TCS34725	TCS34725 RGB Renk Sensörü	ams uyumlu	cat_sensors
prd_v14_sns_apds9960	SNS-APDS9960	APDS-9960 Jest ve Yakınlık Sensörü	Broadcom uyumlu	cat_sensors
prd_v14_sns_cap_soil	SNS-CAP-SOIL	Kapasitif Toprak Nem Sensörü v1.2	Generic	cat_sensors
prd_v14_sns_rain	SNS-RAIN	Yağmur Sensör Modülü	Generic	cat_sensors
prd_v14_sns_waterlevel	SNS-WATERLEVEL	Su Seviye Sensörü	Generic	cat_sensors
prd_v14_sns_flame	SNS-FLAME	IR Alev Sensör Modülü	Generic	cat_sensors
prd_v14_sns_sound_lm393	SNS-SOUND-LM393	LM393 Mikrofon Ses Sensör Modülü	Generic	cat_sensors
prd_v14_sns_hall_a3144	SNS-HALL-A3144	A3144 Hall Etkili Manyetik Sensör	Generic	cat_sensors
prd_v14_sns_ina219	SNS-INA219	INA219 Akım ve Voltaj Sensör Modülü	Texas Instruments uyumlu	cat_sensors
prd_v14_sns_acs712_5a	SNS-ACS712-5A	ACS712 5A Akım Sensörü	Allegro uyumlu	cat_sensors
prd_v14_sns_acs712_20a	SNS-ACS712-20A	ACS712 20A Akım Sensörü	Allegro uyumlu	cat_sensors
prd_v14_sns_max6675	SNS-MAX6675	MAX6675 K Tipi Termokupl Modülü	Maxim uyumlu	cat_sensors
prd_v14_sns_hx711	SNS-HX711	HX711 Load Cell Ağırlık Sensörü Modülü	Generic	cat_sensors
prd_v14_sns_fsr402	SNS-FSR402	FSR402 Kuvvet/Basınç Sensörü	Interlink uyumlu	cat_sensors
prd_v14_sns_mq135	SNS-MQ135	MQ-135 Hava Kalitesi Gaz Sensörü	Winsen uyumlu	cat_sensors
prd_v14_sns_mq7	SNS-MQ7	MQ-7 Karbonmonoksit CO Sensörü	Winsen uyumlu	cat_sensors
prd_v14_sns_mpu9250	SNS-MPU9250	MPU9250 9 Eksen IMU Modülü	TDK/InvenSense uyumlu	cat_sensors
prd_v14_dsp_oled13_sh1106	DSP-OLED13-SH1106	1.3 inç OLED I2C SH1106 128×64	Generic	cat_displays
prd_v14_dsp_tft18_st7735	DSP-TFT18-ST7735	1.8 inç TFT LCD ST7735 128×160	Generic	cat_displays
prd_v14_dsp_tft24_ili9341	DSP-TFT24-ILI9341	2.4 inç TFT LCD ILI9341 240×320	Generic	cat_displays
prd_v14_dsp_tft28_touch	DSP-TFT28-TOUCH	2.8 inç ILI9341 Dokunmatik TFT Ekran	Generic	cat_displays
prd_v14_dsp_lcd2004_i2c	DSP-LCD2004-I2C	2004 LCD 20×4 I2C Ekran	Generic	cat_displays
prd_v14_dsp_tm1637_4d	DSP-TM1637-4D	TM1637 4 Haneli 7 Segment Ekran	Generic	cat_displays
prd_v14_dsp_max7219_8d	DSP-MAX7219-8D	MAX7219 8 Haneli 7 Segment Modül	Generic	cat_displays
prd_v14_dsp_epaper213	DSP-EPAPER213	2.13 inç E-Paper E-Ink Ekran	Waveshare uyumlu	cat_displays
prd_v14_dsp_oled15_rgb	DSP-OLED15-RGB	1.5 inç RGB OLED SSD1351	Generic	cat_displays
prd_v14_dsp_nextion24	DSP-NEXTION24	Nextion 2.4 inç HMI Dokunmatik Ekran	Nextion	cat_displays
prd_v14_drv_drv8833	DRV-DRV8833	DRV8833 Çift DC Motor Sürücü	TI uyumlu	cat_power
prd_v14_drv_tb6612fng	DRV-TB6612FNG	TB6612FNG Çift Motor Sürücü	Toshiba uyumlu	cat_power
prd_v14_drv_bts7960	DRV-BTS7960	BTS7960 43A Yüksek Akım Motor Sürücü	Infineon uyumlu	cat_power
prd_v14_drv_pca9685	DRV-PCA9685	PCA9685 16 Kanal PWM Servo Sürücü	NXP uyumlu	cat_power
prd_v14_drv_tmc2209	DRV-TMC2209	TMC2209 Sessiz Step Motor Sürücü	Trinamic uyumlu	cat_power
prd_v14_mtr_nema17_42	MTR-NEMA17-42	NEMA17 42mm Step Motor	Generic	cat_power
prd_v14_mtr_tt_6v	MTR-TT-6V	6V TT Redüktörlü DC Motor	Generic	cat_power
prd_v14_mtr_37gb_12v	MTR-37GB-12V	37mm 12V Metal Redüktörlü DC Motor	Generic	cat_power
prd_v14_act_solenoid12	ACT-SOLENOID12	12V Push-Pull Solenoid Elektromıknatıs	Generic	cat_power
prd_v14_pwr_xl4015	PWR-XL4015	XL4015 5A Ayarlanabilir Buck Dönüştürücü	XLsemi uyumlu	cat_power
prd_v14_pwr_mt3608	PWR-MT3608	MT3608 2A Step-Up Boost Dönüştürücü	Aerosemi uyumlu	cat_power
prd_v14_pwr_mp1584	PWR-MP1584	MP1584 Mini 3A Buck Dönüştürücü	MPS uyumlu	cat_power
prd_v14_pwr_ams1117_33	PWR-AMS1117-33	AMS1117 3.3V Regülatör Modülü	AMS uyumlu	cat_power
prd_v14_pwr_ams1117_5	PWR-AMS1117-5	AMS1117 5V Regülatör Modülü	AMS uyumlu	cat_power
prd_v14_pwr_ibt2	PWR-IBT2	IBT-2 BTS7960 Motor Sürücü Kartı	Generic	cat_power
prd_v14_mod_ds3231	MOD-DS3231	DS3231 Hassas RTC Gerçek Zaman Saati	Maxim uyumlu	cat_modules
prd_v14_mod_microsd	MOD-MICROSD	MicroSD Kart Okuyucu SPI Modülü	Generic	cat_modules
prd_v14_mod_max485	MOD-MAX485	MAX485 TTL-RS485 Dönüştürücü	Maxim uyumlu	cat_modules
prd_v14_mod_mcp2515	MOD-MCP2515	MCP2515 CAN Bus Modülü TJA1050	Microchip uyumlu	cat_modules
prd_v14_mod_pcf8574	MOD-PCF8574	PCF8574 I2C 8-Bit IO Genişletici	NXP uyumlu	cat_modules
prd_v14_mod_mcp23017	MOD-MCP23017	MCP23017 I2C 16-Bit IO Genişletici	Microchip	cat_modules
prd_v14_mod_level4	MOD-LEVEL4	4 Kanal Çift Yönlü Logic Level Converter	Generic	cat_modules
prd_v14_mod_mosfet_30a	MOD-MOSFET-30A	30A MOSFET Anahtarlama Modülü	Generic	cat_modules
prd_v14_mod_ssr1	MOD-SSR1	1 Kanal Solid State Röle Modülü 5V	Generic	cat_modules
prd_v14_mod_opt4	MOD-OPT4	4 Kanal Optokuplör İzolasyon Modülü	Generic	cat_modules
prd_v14_mod_keypad4x4	MOD-KEYPAD4X4	4×4 Matris Membran Keypad	Generic	cat_modules
prd_v14_mod_rotary_ky040	MOD-ROTARY-KY040	KY-040 Rotary Encoder Modülü	Generic	cat_modules
prd_v14_mod_joystick	MOD-JOYSTICK	PS2 Analog Joystick Modülü	Generic	cat_modules
prd_v14_mod_reed	MOD-REED	Reed Switch Manyetik Kapı Sensör Modülü	Generic	cat_modules
prd_v14_mod_ne555_pwm	MOD-NE555-PWM	NE555 PWM Sinyal Jeneratör Modülü	Generic	cat_modules
prd_v14_com_nrf24l01	COM-NRF24L01	nRF24L01+ 2.4GHz RF Modülü	Nordic uyumlu	cat_wireless
prd_v14_com_nrf24_pa	COM-NRF24-PA	nRF24L01+ PA+LNA Antenli Modül	Nordic uyumlu	cat_wireless
prd_v14_com_lora_sx1278	COM-LORA-SX1278	SX1278 LoRa 433MHz Modülü	Semtech uyumlu	cat_wireless
prd_v14_com_lora_sx1276	COM-LORA-SX1276	SX1276 LoRa 868MHz Modülü	Semtech uyumlu	cat_wireless
prd_v14_com_sim800l	COM-SIM800L	SIM800L GSM/GPRS Modülü	SIMCom uyumlu	cat_wireless
prd_v14_com_sim7600	COM-SIM7600	SIM7600 4G LTE Modülü	SIMCom uyumlu	cat_wireless
prd_v14_com_neo6m	COM-NEO6M	NEO-6M GPS Modülü + Anten	u-blox uyumlu	cat_wireless
prd_v14_com_neom8n	COM-NEOM8N	NEO-M8N GPS/GLONASS Modülü	u-blox uyumlu	cat_wireless
prd_v14_com_hc12	COM-HC12	HC-12 433MHz Seri RF Modülü	Generic	cat_wireless
prd_v14_com_cc1101	COM-CC1101	CC1101 Sub-GHz RF Modülü	Texas Instruments uyumlu	cat_wireless
prd_v14_com_esp01	COM-ESP01	ESP-01 ESP8266 Wi‑Fi Modülü	Espressif uyumlu	cat_wireless
prd_v14_com_hm10	COM-HM10	HM-10 Bluetooth BLE Modülü	CC2541 uyumlu	cat_wireless
prd_v14_led_ws2812_8r	LED-WS2812-8R	WS2812B NeoPixel 8 LED Halka	Generic	cat_led
prd_v14_led_ws2812_16r	LED-WS2812-16R	WS2812B NeoPixel 16 LED Halka	Generic	cat_led
prd_v14_led_ws2812_24r	LED-WS2812-24R	WS2812B NeoPixel 24 LED Halka	Generic	cat_led
prd_v14_led_ws2812_1m60	LED-WS2812-1M60	WS2812B 1m 60 LED/m RGB Şerit	Generic	cat_led
prd_v14_led_sk6812_rgbw	LED-SK6812-RGBW	SK6812 RGBW Adreslenebilir LED Şerit	Generic	cat_led
prd_v14_led_rgb_common	LED-RGB-COMMON	5mm RGB LED Ortak Katot 10lu	Generic	cat_led
prd_v14_led_white_5mm	LED-WHITE-5MM	5mm Beyaz LED 20li Paket	Generic	cat_led
prd_v14_led_ir_940	LED-IR-940	940nm IR LED 5mm 10lu Paket	Generic	cat_led
prd_v14_led_laser650	LED-LASER650	650nm Kırmızı Lazer Diyot Modülü	Generic	cat_led
prd_v14_led_traffic	LED-TRAFFIC	Kırmızı Sarı Yeşil Trafik Lambası Modülü	Generic	cat_led
prd_v14_pas_res_kit600	PAS-RES-KIT600	600 Parça 1/4W Direnç Seti	Generic	cat_passive
prd_v14_pas_res_220r	PAS-RES-220R	220Ω 1/4W Direnç 50li	Generic	cat_passive
prd_v14_pas_res_1k	PAS-RES-1K	1kΩ 1/4W Direnç 50li	Generic	cat_passive
prd_v14_pas_res_10k	PAS-RES-10K	10kΩ 1/4W Direnç 50li	Generic	cat_passive
prd_v14_pas_cap_cer_kit	PAS-CAP-CER-KIT	Seramik Kondansatör Seti	Generic	cat_passive
prd_v14_pas_cap_elco_kit	PAS-CAP-ELCO-KIT	Elektrolitik Kondansatör Seti	Generic	cat_passive
prd_v14_pas_cap_100nf	PAS-CAP-100NF	100nF Seramik Kondansatör 50li	Generic	cat_passive
prd_v14_pas_cap_100uf	PAS-CAP-100UF	100µF 25V Elektrolitik Kondansatör 20li	Generic	cat_passive
prd_v14_pas_pot_10k	PAS-POT-10K	10kΩ Lineer Potansiyometre	Generic	cat_passive
prd_v14_pas_trimpot_10k	PAS-TRIMPOT-10K	3296W 10k Çok Turlu Trimpot	Generic	cat_passive
prd_v14_pas_ldr5	PAS-LDR5	5mm LDR Foto Direnç 10lu	Generic	cat_passive
prd_v14_pas_ntc10k	PAS-NTC10K	10k NTC Termistör 10lu	Generic	cat_passive
prd_v14_pas_button6	PAS-BUTTON6	6×6mm Tact Switch 20li	Generic	cat_passive
prd_v14_pas_slide2	PAS-SLIDE2	Mini 2 Konumlu Slide Switch 10lu	Generic	cat_passive
prd_v14_pas_dip8	PAS-DIP8	8 Pozisyon DIP Switch	Generic	cat_passive
prd_v14_ic_ne555_dip	IC-NE555-DIP	NE555P Timer Entegresi DIP-8	Texas Instruments uyumlu	cat_ic
prd_v14_ic_lm358_dip	IC-LM358-DIP	LM358N Dual Op-Amp DIP-8	Texas Instruments uyumlu	cat_ic
prd_v14_ic_lm393_dip	IC-LM393-DIP	LM393N Dual Comparator DIP-8	Texas Instruments uyumlu	cat_ic
prd_v14_ic_l293d	IC-L293D	L293D Quad H-Bridge Motor Sürücü DIP	ST/TI uyumlu	cat_ic
prd_v14_ic_uln2003a	IC-ULN2003A	ULN2003A Darlington Sürücü DIP-16	ST uyumlu	cat_ic
prd_v14_ic_74hc595	IC-74HC595	74HC595 Shift Register DIP-16	Nexperia uyumlu	cat_ic
prd_v14_ic_74hc165	IC-74HC165	74HC165 Parallel-In Shift Register DIP-16	Nexperia uyumlu	cat_ic
prd_v14_ic_cd4017	IC-CD4017	CD4017 Decade Counter DIP-16	TI uyumlu	cat_ic
prd_v14_ic_pc817	IC-PC817	PC817 Optokuplör DIP-4 10lu	Sharp uyumlu	cat_ic
prd_v14_ic_irlz44n	IC-IRLZ44N	IRLZ44N Logic Level N-MOSFET	Infineon uyumlu	cat_ic
prd_v14_ic_irf520	IC-IRF520	IRF520 N-Kanal MOSFET	Vishay uyumlu	cat_ic
prd_v14_ic_2n2222	IC-2N2222	2N2222A NPN Transistör 20li	Generic	cat_ic
prd_v14_ic_bc547	IC-BC547	BC547 NPN Transistör 20li	Generic	cat_ic
prd_v14_ic_1n4007	IC-1N4007	1N4007 Doğrultucu Diyot 20li	Generic	cat_ic
prd_v14_ic_1n4148	IC-1N4148	1N4148 Hızlı Sinyal Diyotu 50li	Generic	cat_ic
prd_v14_ic_ss14	IC-SS14	SS14 Schottky Diyot SMD 20li	Generic	cat_ic
prd_v14_ic_mcp3008	IC-MCP3008	MCP3008 10-bit 8 Kanal ADC DIP	Microchip	cat_ic
prd_v14_ic_ads1115	IC-ADS1115	ADS1115 16-bit 4 Kanal ADC Modülü	Texas Instruments uyumlu	cat_ic
prd_v14_con_jmp_mf40	CON-JMP-MF40	40 Pin M-F Jumper Kablo 20cm	Generic	cat_connectors
prd_v14_con_jmp_ff40	CON-JMP-FF40	40 Pin F-F Jumper Kablo 20cm	Generic	cat_connectors
prd_v14_con_jmp_mm20	CON-JMP-MM20	20cm M-M Jumper Kablo 40lı	Generic	cat_connectors
prd_v14_con_header_m40	CON-HEADER-M40	2.54mm Erkek Pin Header 1×40	Generic	cat_connectors
prd_v14_con_header_f40	CON-HEADER-F40	2.54mm Dişi Pin Header 1×40	Generic	cat_connectors
prd_v14_con_screw2_5	CON-SCREW2-5	2 Pin 5.08mm Vidalı Terminal 10lu	Generic	cat_connectors
prd_v14_con_jstxh2	CON-JSTXH2	JST-XH 2 Pin Konnektör Seti	Generic	cat_connectors
prd_v14_con_jstxh3	CON-JSTXH3	JST-XH 3 Pin Konnektör Seti	Generic	cat_connectors
prd_v14_con_jstph2	CON-JSTPH2	JST-PH 2 Pin Pil Konnektörü Kablolu	Generic	cat_connectors
prd_v14_con_dcjack21	CON-DCJACK21	5.5×2.1mm DC Jack Dişi Terminal	Generic	cat_connectors
prd_v14_con_usb_c_break	CON-USB-C-BREAK	USB Type-C Dişi Breakout Kartı	Generic	cat_connectors
prd_v14_con_microusb_break	CON-MICROUSB-BREAK	Micro USB Dişi Breakout Kartı	Generic	cat_connectors
prd_v14_con_ribbon10	CON-RIBBON10	10 Damarlı Şerit Kablo 1m	Generic	cat_connectors
prd_v14_con_heatshrink	CON-HEATSHRINK	Isı ile Daralan Makaron Seti 100 Parça	Generic	cat_connectors
prd_v14_con_silicone22	CON-SILICONE22	22AWG Silikon Kablo Kırmızı/Siyah 2m	Generic	cat_connectors
prd_v14_bat_18650_3000	BAT-18650-3000	18650 Li-ion Pil 3.7V 3000mAh	Generic	cat_battery
prd_v14_bat_holder1	BAT-HOLDER1	1x18650 Pil Yuvası Kablolu	Generic	cat_battery
prd_v14_bat_holder2	BAT-HOLDER2	2x18650 Pil Yuvası Kablolu	Generic	cat_battery
prd_v14_bat_9v_clip	BAT-9V-CLIP	9V Pil Başlığı Kablolu 10lu	Generic	cat_battery
prd_v14_bat_aaa3	BAT-AAA3	3xAAA Anahtarlı Pil Yuvası	Generic	cat_battery
prd_v14_bat_lipo_500	BAT-LIPO-500	3.7V 500mAh LiPo Pil	Generic	cat_battery
prd_v14_bat_lipo_1200	BAT-LIPO-1200	3.7V 1200mAh LiPo Pil	Generic	cat_battery
prd_v14_bat_tp4056_prot	BAT-TP4056-PROT	TP4056 Type-C 1S Li-ion Şarj Koruma Modülü	Generic	cat_battery
prd_v14_bat_bms2s_10a	BAT-BMS2S-10A	2S 10A BMS Li-ion Koruma Kartı	Generic	cat_battery
prd_v14_bat_bms3s_20a	BAT-BMS3S-20A	3S 20A BMS Li-ion Koruma Kartı	Generic	cat_battery
prd_v14_bat_boost_powerbank	BAT-BOOST-POWERBANK	5V 2A Powerbank Boost Modülü	Generic	cat_battery
prd_v14_bat_charger_2s	BAT-CHARGER-2S	2S Li-ion Denge Şarj Modülü	Generic	cat_battery
prd_v14_rob_wheel65	ROB-WHEEL65	65mm Robot Tekerleği Sarı	Generic	cat_robotics
prd_v14_rob_caster	ROB-CASTER	Mini Sarhoş Teker Robot Caster	Generic	cat_robotics
prd_v14_rob_chassis2wd	ROB-CHASSIS2WD	2WD Akrilik Robot Araba Şasi Kiti	Generic	cat_robotics
prd_v14_rob_chassis4wd	ROB-CHASSIS4WD	4WD Akrilik Robot Araba Şasi Kiti	Generic	cat_robotics
prd_v14_rob_encoder20	ROB-ENCODER20	20 Slot Encoder Disk + Optik Sensör	Generic	cat_robotics
prd_v14_rob_servo_bracket	ROB-SERVO-BRACKET	MG996R Servo U Bracket Metal	Generic	cat_robotics
prd_v14_rob_arm4dof	ROB-ARM4DOF	4DOF Akrilik Robot Kol Kiti	Generic	cat_robotics
prd_v14_rob_pulley_gt2	ROB-PULLEY-GT2	GT2 20 Diş Kasnak 5mm	Generic	cat_robotics
prd_v14_rob_belt_gt2	ROB-BELT-GT2	GT2 Zaman Kayışı 6mm 1m	Generic	cat_robotics
prd_v14_rob_leadscrew_t8	ROB-LEADSCREW-T8	T8 8mm Vidalı Mil 300mm + Somun	Generic	cat_robotics
prd_v14_rob_lm8uu	ROB-LM8UU	LM8UU 8mm Lineer Rulman	Generic	cat_robotics
prd_v14_rob_shaft8_300	ROB-SHAFT8-300	8mm Krom Mil 300mm	Generic	cat_robotics
prd_v14_aud_buzzer_active	AUD-BUZZER-ACTIVE	5V Aktif Buzzer 10lu	Generic	cat_audio
prd_v14_aud_buzzer_passive	AUD-BUZZER-PASSIVE	Pasif Piezo Buzzer 10lu	Generic	cat_audio
prd_v14_aud_speaker8_05	AUD-SPEAKER8-05	8Ω 0.5W Mini Hoparlör 40mm	Generic	cat_audio
prd_v14_aud_speaker4_3	AUD-SPEAKER4-3	4Ω 3W Mini Hoparlör	Generic	cat_audio
prd_v14_aud_pam8403	AUD-PAM8403	PAM8403 2×3W Stereo Amplifikatör Modülü	Generic	cat_audio
prd_v14_aud_max98357	AUD-MAX98357	MAX98357A I2S 3W Dijital Amplifikatör	Maxim uyumlu	cat_audio
prd_v14_aud_dfplayer	AUD-DFPLAYER	DFPlayer Mini MP3 Modülü	DFRobot uyumlu	cat_audio
prd_v14_aud_mic_max4466	AUD-MIC-MAX4466	MAX4466 Elektret Mikrofon Amplifikatör Modülü	Maxim uyumlu	cat_audio
prd_v14_proto_bread400	PROTO-BREAD400	400 Nokta Mini Breadboard	Generic	cat_tools
prd_v14_proto_bread170	PROTO-BREAD170	170 Nokta Mini Breadboard	Generic	cat_tools
prd_v14_proto_perf5x7	PROTO-PERF5X7	5×7cm Delikli Pertinaks Prototip Kart	Generic	cat_tools
prd_v14_proto_perf7x9	PROTO-PERF7X9	7×9cm Delikli Pertinaks Prototip Kart	Generic	cat_tools
prd_v14_proto_dupont_kit	PROTO-DUPONT-KIT	Dupont Konnektör Pin ve Housing Seti	Generic	cat_tools
prd_v14_proto_alligator10	PROTO-ALLIGATOR10	Timsah Krokodil Kablo 10lu Set	Generic	cat_tools
prd_v14_tool_dmm_dt830	TOOL-DMM-DT830	DT830D Dijital Multimetre	Generic	cat_measurement
prd_v14_tool_usb_meter	TOOL-USB-METER	USB Type-C Voltaj Akım Ölçer	Generic	cat_measurement
prd_v14_tool_logic8	TOOL-LOGIC8	8 Kanal USB Logic Analyzer 24MHz	Saleae uyumlu	cat_measurement
prd_v14_tool_solder60	TOOL-SOLDER60	60W Ayarlı Havya	Generic	cat_measurement
prd_v14_tool_t12	TOOL-T12	T12 Dijital Isı Kontrollü Havya İstasyonu	Generic	cat_measurement
prd_v14_tool_solderwire	TOOL-SOLDERWIRE	0.8mm Lehim Teli 100g	Generic	cat_measurement
prd_v14_tool_flux	TOOL-FLUX	No-Clean Lehim Flux 10cc	Generic	cat_measurement
prd_v14_tool_desolder	TOOL-DESOLDER	Lehim Sökme Pompası	Generic	cat_measurement
prd_v14_tool_wick	TOOL-WICK	2mm Lehim Sökme Fitili 1.5m	Generic	cat_measurement
prd_v14_tool_thirdhand	TOOL-THIRDHAND	Büyüteçli Üçüncü El Lehim Tutucu	Generic	cat_measurement
prd_v14_tool_wirestrip	TOOL-WIRESTRIP	Otomatik Kablo Soyma Pensesi	Generic	cat_measurement
prd_v14_tool_crimp_dupont	TOOL-CRIMP-DUPONT	Dupont/JST Krimp Pensesi	Generic	cat_measurement
`.trim();

const CREATED_AT = '2026-09-03T11:30:00.000Z';

export const catalogV14 = {
  version: '14',
  categories: CATEGORY_ROWS.map(([id, name, slug, icon]) => ({ id, name, slug, icon, active: true })),
  products: PRODUCT_ROWS.split(/\n+/).map((line) => {
    const [id, sku, name, brand, categoryId] = line.split('\t');
    return {
      id, sku, name, brand, categoryId,
      description: `${name} — ArduFiyat geniş elektronik kataloğu ürünü.`,
      tags: [sku, name, brand].join(' ').toLocaleLowerCase('tr-TR').split(/[^a-z0-9çğıöşü+-]+/i).filter(Boolean).slice(0, 10),
      active: true, imageKey: '', featured: false,
      imageUrl: '', imageSourceUrl: '', imageCredit: '',
      createdAt: CREATED_AT, updatedAt: CREATED_AT
    };
  })
};
