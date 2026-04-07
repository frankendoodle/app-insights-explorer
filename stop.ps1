foreach ($port in 3000, 3001) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        Stop-Process -Id $conn.OwningProcess -Force
        Write-Host "Stopped process on port $port (PID $($conn.OwningProcess))"
    } else {
        Write-Host "Nothing running on port $port"
    }
}
