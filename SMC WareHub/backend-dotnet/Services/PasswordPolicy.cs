using System.Text.RegularExpressions;

namespace WareHub.Api.Services;

public static class PasswordPolicy
{
    public const int MinLength = 10;
    public const int MaxLength = 128;

    private static readonly HashSet<string> CommonRoots = new(StringComparer.OrdinalIgnoreCase)
    {
        "password", "passw", "admin", "administrator", "root", "user", "qwerty", "qwertyuiop", "abc", "abcdef", "letmein",
        "welcome", "iloveyou", "matkhau", "mk", "warehub", "smc", "smcmfg", "test", "guest", "changeme", "secret", "login",
    };

    public static string? Validate(string? password, string? username = null)
    {
        if (string.IsNullOrEmpty(password) || password.Length < MinLength) return $"Mật khẩu cần tối thiểu {MinLength} ký tự";
        if (password.Length > MaxLength) return $"Mật khẩu không được vượt quá {MaxLength} ký tự";
        if (!password.Any(char.IsLetter) || !password.Any(char.IsDigit)) return "Mật khẩu phải có cả chữ và số";
        if (password.Distinct().Count() < 5) return "Mật khẩu quá đơn giản, hãy dùng nhiều ký tự khác nhau hơn";
        if (!string.IsNullOrWhiteSpace(username) && username.Trim().Length >= 3 && password.Contains(username.Trim(), StringComparison.OrdinalIgnoreCase))
            return "Mật khẩu không được chứa tên đăng nhập";
        var letters = Regex.Replace(password, "[^A-Za-z]", "");
        if (CommonRoots.Contains(letters)) return "Mật khẩu quá phổ biến, hãy chọn mật khẩu khác";
        return null;
    }
}
