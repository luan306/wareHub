<#
.SYNOPSIS
  Bật/tắt chế độ bảo trì của WareHub khi cập nhật code.

.DESCRIPTION
  Chế độ bảo trì là 1 file cờ (maintenance.json) cạnh ứng dụng backend. Khi file tồn tại, mọi người dùng không phải
  quản trị viên sẽ thấy màn hình "Hệ thống đang bảo trì" (API trả 503); quản trị viên vẫn dùng bình thường.
  Vì là file nên trạng thái còn nguyên khi backend tắt/khởi động lại, và script này chạy được cả lúc backend đang tắt.

  Quy trình cập nhật khuyến nghị:
    1. .\scripts\maintenance.ps1 on "Đang cập nhật phiên bản mới" -Until "2026-09-25 09:30"
    2. dừng backend -> copy code mới -> build (frontend + backend) -> chạy lại backend
    3. kiểm tra nhanh bằng tài khoản admin
    4. .\scripts\maintenance.ps1 off
  Trong lúc backend tắt hẳn, trình duyệt của người dùng tự hiện màn hình "không kết nối được máy chủ" và tự tiếp tục
  (tự tải lại nếu có phiên bản mới) khi backend chạy lại.

.EXAMPLE
  .\scripts\maintenance.ps1 on
.EXAMPLE
  .\scripts\maintenance.ps1 on "Bảo trì hệ thống, quay lại sau 15 phút" -Until "2026-09-25 09:30"
.EXAMPLE
  .\scripts\maintenance.ps1 off
.EXAMPLE
  .\scripts\maintenance.ps1 status
#>
param(
    [Parameter(Mandatory, Position = 0)][ValidateSet('on', 'off', 'status')][string]$Action,
    [Parameter(Position = 1)][string]$Message = '',
    # Giờ dự kiến xong (hiển thị cho người dùng), ví dụ "2026-09-25 09:30". Không bắt buộc.
    [string]$Until = '',
    # Đổi nếu cấu hình Maintenance:FlagFile của backend trỏ tới chỗ khác.
    [string]$FlagFile = (Join-Path $PSScriptRoot '..\backend-dotnet\maintenance.json')
)

$ErrorActionPreference = 'Stop'
$flag = [System.IO.Path]::GetFullPath($FlagFile)
$utf8 = New-Object System.Text.UTF8Encoding($false)

switch ($Action) {
    'on' {
        $defaultMessage = 'Hệ thống đang bảo trì, vui lòng quay lại sau ít phút.'
        $body = [ordered]@{
            enabled    = $true
            message    = $(if ($Message.Trim()) { $Message.Trim() } else { $defaultMessage })
            started_at = [DateTimeOffset]::Now.ToString('o')
            until      = $(if ($Until.Trim()) { [DateTimeOffset]::Parse($Until).ToString('o') } else { $null })
        }
        [System.IO.File]::WriteAllText($flag, ($body | ConvertTo-Json), $utf8)
        Write-Host "Đã BẬT chế độ bảo trì: $flag"
        Write-Host "Nội dung hiển thị: $($body.message)"
    }
    'off' {
        if (Test-Path $flag) { Remove-Item -LiteralPath $flag -Force; Write-Host "Đã TẮT chế độ bảo trì." }
        else { Write-Host "Chế độ bảo trì vốn đang tắt." }
    }
    'status' {
        if (Test-Path $flag) { Write-Host "Đang BẬT ($flag):"; Get-Content -LiteralPath $flag -Raw }
        else { Write-Host "Đang TẮT." }
    }
}
