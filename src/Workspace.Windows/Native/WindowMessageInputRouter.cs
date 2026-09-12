using System.Runtime.InteropServices;

namespace Workspace.Windows.Native;

/// <summary>
/// Generic message-mode input without switching the Windows foreground window.
/// This queues ordinary window messages; raw-input-only programs require native handoff.
/// </summary>
public sealed class WindowMessageInputRouter
{
    private readonly Dictionary<nint, nint> _keyboardTargets = [];
    private readonly HashSet<(nint Hwnd, ushort Key)> _keys = [];
    private readonly HashSet<(nint Hwnd, uint Button)> _buttons = [];

    public void Route(nint root, WindowBounds bounds, WindowInputIntent intent)
    {
        if (!IsWindow(root)) throw new InputTargetNotPermittedException("Window closed.");
        var target = _keyboardTargets.TryGetValue(root, out var saved) && IsWindow(saved) && (saved == root || IsChild(root, saved)) ? saved : root;
        if (intent.Kind is "pointer" or "wheel")
        {
            var mapped = InputCoordinateMapper.Map(intent.X!.Value, intent.Y!.Value, bounds);
            var point = new Point { X = mapped.X, Y = mapped.Y };
            ScreenToClient(root, ref point);
            GetClientRect(root, out var client);
            if (point.X < 0 || point.Y < 0 || point.X >= client.Right || point.Y >= client.Bottom)
                throw new InputTargetNotPermittedException("Native window chrome requires native handoff.");
            target = root;
            for (var depth = 0; depth < 16; depth++)
            {
                var child = ChildWindowFromPointEx(target, point, 7);
                if (child == nint.Zero || child == target) break;
                ClientToScreen(target, ref point);
                ScreenToClient(child, ref point);
                target = child;
            }
            _keyboardTargets[root] = target;
            uint flags = 0;
            if (_buttons.Contains((target, 1))) flags |= 1;
            if (_buttons.Contains((target, 2))) flags |= 2;
            if (intent.Kind == "wheel")
            {
                var screenPoint = new Point { X = mapped.X, Y = mapped.Y };
                if (intent.DeltaY != 0) Post(target, 0x020A, Wheel(flags, -intent.DeltaY!.Value), Pack(screenPoint));
                if (intent.DeltaX != 0) Post(target, 0x020E, Wheel(flags, intent.DeltaX!.Value), Pack(screenPoint));
                return;
            }
            var button = intent.Button == "secondary" ? 2u : 1u;
            var message = intent.Phase switch
            {
                "move" => 0x0200u,
                "down" => button == 1 ? 0x0201u : 0x0204u,
                "up" => button == 1 ? 0x0202u : 0x0205u,
                _ => throw new ArgumentException("Unknown pointer phase."),
            };
            if (intent.Phase == "down") { _buttons.Add((target, button)); flags |= button; }
            if (intent.Phase == "up") { _buttons.Remove((target, button)); flags &= ~button; }
            Post(target, message, flags, Pack(point));
            return;
        }
        if (intent.Kind == "text")
        {
            foreach (var character in intent.Text!) Post(target, 0x0102, character, new nint(1));
            return;
        }
        if (intent.Kind == "key")
        {
            var vk = VirtualKey(intent.Key!);
            var up = intent.Phase == "up";
            var scan = MapVirtualKey(vk, 0);
            var bits = 1u | (scan << 16) | (up ? 0xC0000000u : 0u);
            if (up) _keys.Remove((target, vk)); else _keys.Add((target, vk));
            Post(target, up ? 0x0101u : 0x0100u, vk, new nint(unchecked((int)bits)));
            return;
        }
        throw new ArgumentException("Unknown input kind.");
    }

    public void ReleaseAll()
    {
        foreach (var (hwnd, key) in _keys)
            if (IsWindow(hwnd)) PostMessage(hwnd, 0x0101, key, new nint(unchecked((int)(0xC0000001u | (MapVirtualKey(key, 0) << 16)))));
        foreach (var (hwnd, button) in _buttons)
            if (IsWindow(hwnd)) PostMessage(hwnd, button == 1 ? 0x0202u : 0x0205u, 0, nint.Zero);
        _keys.Clear(); _buttons.Clear(); _keyboardTargets.Clear();
    }

    private static ushort VirtualKey(string key)
    {
        var value = key switch
        {
            "Backspace" => 8, "Tab" => 9, "Enter" => 13, "Shift" => 16, "Control" => 17, "Alt" => 18,
            "Escape" => 27, " " or "Space" => 32, "PageUp" => 33, "PageDown" => 34, "End" => 35, "Home" => 36,
            "ArrowLeft" => 37, "ArrowUp" => 38, "ArrowRight" => 39, "ArrowDown" => 40, "Insert" => 45, "Delete" => 46,
            _ => -1,
        };
        if (value >= 0) return (ushort)value;
        if (key.StartsWith('F') && int.TryParse(key.AsSpan(1), out var function) && function is >= 1 and <= 24) return (ushort)(0x70 + function - 1);
        if (key.Length == 1) { var mapped = VkKeyScan(key[0]); if (mapped != -1) return (ushort)(mapped & 0xff); }
        throw new ArgumentException("Unsupported non-text key.");
    }

    private static nuint Wheel(uint flags, double delta) => unchecked((nuint)(flags | ((uint)(ushort)(short)Math.Clamp(Math.Round(delta), short.MinValue, short.MaxValue) << 16)));
    private static nint Pack(Point point) => new(unchecked((int)((uint)(ushort)point.X | ((uint)(ushort)point.Y << 16))));
    private static void Post(nint hwnd, uint message, nuint wparam, nint lparam)
    {
        if (!PostMessage(hwnd, message, wparam, lparam)) throw new InputTargetNotPermittedException("Windows rejected the input message.");
    }
    [StructLayout(LayoutKind.Sequential)] private struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] private struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] private static extern bool IsWindow(nint hwnd);
    [DllImport("user32.dll")] private static extern bool IsChild(nint parent, nint child);
    [DllImport("user32.dll")] private static extern bool GetClientRect(nint hwnd, out Rect rect);
    [DllImport("user32.dll")] private static extern bool ScreenToClient(nint hwnd, ref Point point);
    [DllImport("user32.dll")] private static extern bool ClientToScreen(nint hwnd, ref Point point);
    [DllImport("user32.dll")] private static extern nint ChildWindowFromPointEx(nint parent, Point point, uint flags);
    [DllImport("user32.dll", EntryPoint = "PostMessageW", SetLastError = true)] private static extern bool PostMessage(nint hwnd, uint message, nuint wparam, nint lparam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern short VkKeyScan(char character);
    [DllImport("user32.dll", EntryPoint = "MapVirtualKeyW")] private static extern uint MapVirtualKey(uint code, uint type);
}
