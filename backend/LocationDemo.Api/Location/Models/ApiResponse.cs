namespace LocationDemo.Api.Location.Models;

public sealed class ApiResponse<T>
{
    public bool Success { get; init; }
    public string? ErrorCode { get; init; }
    public string? Message { get; init; }
    public T? Data { get; init; }
    public IDictionary<string, object>? Metadata { get; init; }

    public static ApiResponse<T> Ok(T data, IDictionary<string, object>? metadata = null)
        => new()
        {
            Success = true,
            Data = data,
            Metadata = metadata
        };

    public static ApiResponse<T> Fail(string errorCode, string message, IDictionary<string, object>? metadata = null)
        => new()
        {
            Success = false,
            ErrorCode = errorCode,
            Message = message,
            Metadata = metadata
        };

    public static ApiResponse<T> Fail(string errorCode, string message, T data, IDictionary<string, object>? metadata = null)
        => new()
        {
            Success = false,
            ErrorCode = errorCode,
            Message = message,
            Data = data,
            Metadata = metadata
        };
}
