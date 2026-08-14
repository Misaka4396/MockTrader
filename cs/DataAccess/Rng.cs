using System;

namespace MockTrader.Data
{
    public static class Rng
    {
        // FNV-1a 32-bit 字符串哈希
        public static uint StringSeed(string str)
        {
            uint h = 0x811c9dc5u;
            foreach (char c in str)
            {
                h ^= (uint)c;
                h = unchecked(h * 0x01000193u);
            }
            return h;
        }
    }

    // mulberry32：与 JS 实现逐位一致（Math.imul = 取 32 位低位乘积）
    public sealed class Mulberry32
    {
        private uint a;

        public Mulberry32(uint seed) { a = seed; }

        public uint Next()
        {
            a = unchecked(a + 0x6D2B79F5u);
            uint t = a;
            t = unchecked((t ^ (t >> 15)) * (t | 1u));
            uint imul2 = unchecked((t ^ (t >> 7)) * (t | 61u));
            int ts = unchecked((int)t);
            int i2s = unchecked((int)imul2);
            long sum = (long)ts + (long)i2s;
            int ss = unchecked((int)sum);
            t = unchecked((uint)(ts ^ ss));
            t ^= (t >> 14);
            return t;
        }

        public double NextDouble() => Next() / 4294967296.0;

        // Box-Muller 标准正态
        public double NextGaussian()
        {
            double u = 0, v = 0;
            while (u == 0) u = NextDouble();
            while (v == 0) v = NextDouble();
            return Math.Sqrt(-2.0 * Math.Log(u)) * Math.Cos(2.0 * Math.PI * v);
        }
    }
}
