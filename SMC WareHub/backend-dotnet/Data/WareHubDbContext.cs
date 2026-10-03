using Microsoft.EntityFrameworkCore;

namespace WareHub.Api.Data;

public sealed class WareHubDbContext(DbContextOptions<WareHubDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Device> Devices => Set<Device>();
    public DbSet<PrintHistory> PrintHistory => Set<PrintHistory>();
    public DbSet<DeviceHistory> DeviceHistory => Set<DeviceHistory>();
    public DbSet<Handover> Handovers => Set<Handover>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Username).HasMaxLength(50).IsRequired();
            entity.HasIndex(x => x.Username).IsUnique();
            entity.Property(x => x.FullName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Role).HasConversion<string>().HasMaxLength(10);
            entity.Property(x => x.AuthSource).HasMaxLength(10).HasDefaultValue("local");
            entity.Property(x => x.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP(6)").ValueGeneratedOnAdd();
        });
        modelBuilder.Entity<Device>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Ma).HasMaxLength(50).IsRequired();
            entity.HasIndex(x => x.Ma).IsUnique();
            entity.Property(x => x.Ten).HasMaxLength(150).IsRequired();
            entity.Property(x => x.Loai).HasMaxLength(20).IsRequired();
            entity.Property(x => x.Kho).HasMaxLength(2).IsRequired();
            entity.Property(x => x.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP(6)").ValueGeneratedOnAdd();
            entity.Property(x => x.UpdatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP(6)").ValueGeneratedOnAddOrUpdate();
            entity.Property(x => x.Model).HasMaxLength(150);
            entity.Property(x => x.Cpu).HasMaxLength(100);
            entity.Property(x => x.Ram).HasMaxLength(100);
            entity.Property(x => x.Storage).HasMaxLength(100);
            entity.Property(x => x.UserName).HasMaxLength(100);
            entity.Property(x => x.PhongBan).HasMaxLength(100);
            entity.Property(x => x.GhiChu).HasMaxLength(500);
            entity.Property(x => x.Producer).HasMaxLength(100);
            entity.Property(x => x.IpAddress).HasMaxLength(45);
            // Khớp đúng độ dài cột ALTER TABLE tương ứng trong Program.cs (EnsureDeviceColumnAsync) — thiếu khai báo ở đây
            // khiến CSDL mới (EnsureCreatedAsync) tạo cột không giới hạn độ dài, khác hẳn CSDL đã nâng cấp (ALTER TABLE ... VARCHAR(n)).
            entity.Property(x => x.OsName).HasMaxLength(100);
            entity.Property(x => x.OfficeName).HasMaxLength(100);
            entity.Property(x => x.PhoneNumber).HasMaxLength(30);
            entity.Property(x => x.SimSerial).HasMaxLength(50);
            entity.Property(x => x.GlpiType).HasMaxLength(20);
            // Tên chỉ mục khớp đúng chữ với EnsureIndexAsync(db, "devices", "IX_devices_glpi_type_id", ...) trong Program.cs
            // — nếu khác tên, CSDL mới (EnsureCreatedAsync tạo theo tên quy ước EF) và bước Ensure* sau đó (dò theo tên cũ,
            // không thấy nên tạo thêm 1 lần nữa) sẽ tạo ra 2 chỉ mục trùng nhau trên cùng 2 cột.
            entity.HasIndex(x => new { x.GlpiType, x.GlpiId }).HasDatabaseName("IX_devices_glpi_type_id");
            entity.HasIndex(x => x.Loai);
            entity.HasIndex(x => x.LifecycleStatus);
            entity.HasIndex(x => x.PhongBan);
        });
        modelBuilder.Entity<PrintHistory>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.PrintedByName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.PrintedAt).HasDefaultValueSql("CURRENT_TIMESTAMP(6)").ValueGeneratedOnAdd();
            entity.HasIndex(x => x.PrintedAt);
            entity.HasOne(x => x.Device).WithMany(x => x.PrintHistory).HasForeignKey(x => x.DeviceId).OnDelete(DeleteBehavior.Cascade);
            // KHÔNG cấu hình khoá ngoại tới User (giống Handover bên dưới) — xoá tài khoản không được chặn bởi lịch sử in
            // tem; tên người in đã chụp sẵn vào PrintedByName lúc ghi, không cần join bảng users để hiển thị.
        });
        modelBuilder.Entity<Handover>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.No).HasMaxLength(12).IsRequired();
            entity.HasIndex(x => x.No).IsUnique();
            entity.Property(x => x.DeviceMa).HasMaxLength(50);
            entity.Property(x => x.FullName).HasMaxLength(100);
            entity.Property(x => x.CreatedByName).HasMaxLength(100);
            entity.Property(x => x.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP(6)").ValueGeneratedOnAdd();
        });
        modelBuilder.Entity<DeviceHistory>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.FieldName).HasMaxLength(30).IsRequired();
            entity.Property(x => x.OldValue).HasMaxLength(255);
            entity.Property(x => x.NewValue).HasMaxLength(255);
            entity.Property(x => x.ChangedByName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.ChangedAt).HasDefaultValueSql("CURRENT_TIMESTAMP(6)").ValueGeneratedOnAdd();
            entity.HasIndex(x => x.ChangedAt);
            entity.HasIndex(x => x.DeviceId);
            entity.HasOne(x => x.Device).WithMany().HasForeignKey(x => x.DeviceId).OnDelete(DeleteBehavior.Cascade);
            // KHÔNG cấu hình khoá ngoại tới User — lý do giống PrintHistory ở trên (dùng ChangedByName thay vì join).
        });
    }
}
