using Microsoft.EntityFrameworkCore;

namespace WareHub.Api.Data;

public sealed class WareHubDbContext(DbContextOptions<WareHubDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Device> Devices => Set<Device>();
    public DbSet<PrintHistory> PrintHistory => Set<PrintHistory>();
    public DbSet<DeviceHistory> DeviceHistory => Set<DeviceHistory>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Username).HasMaxLength(50).IsRequired();
            entity.HasIndex(x => x.Username).IsUnique();
            entity.Property(x => x.FullName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Role).HasConversion<string>().HasMaxLength(10);
            entity.Property(x => x.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP").ValueGeneratedOnAdd();
        });
        modelBuilder.Entity<Device>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Ma).HasMaxLength(50).IsRequired();
            entity.HasIndex(x => x.Ma).IsUnique();
            entity.Property(x => x.Ten).HasMaxLength(150).IsRequired();
            entity.Property(x => x.Loai).HasMaxLength(20).IsRequired();
            entity.Property(x => x.Kho).HasMaxLength(2).IsRequired();
            entity.Property(x => x.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP").ValueGeneratedOnAdd();
            entity.Property(x => x.UpdatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP").ValueGeneratedOnAddOrUpdate();
            entity.Property(x => x.Model).HasMaxLength(150);
            entity.Property(x => x.Cpu).HasMaxLength(100);
            entity.Property(x => x.Ram).HasMaxLength(100);
            entity.Property(x => x.Storage).HasMaxLength(100);
            entity.Property(x => x.UserName).HasMaxLength(100);
            entity.Property(x => x.PhongBan).HasMaxLength(100);
            entity.Property(x => x.GhiChu).HasMaxLength(500);
            entity.Property(x => x.Producer).HasMaxLength(100);
            entity.Property(x => x.IpAddress).HasMaxLength(45);
            entity.HasIndex(x => x.Loai);
            entity.HasIndex(x => x.LifecycleStatus);
            entity.HasIndex(x => x.IsActive);
            entity.HasIndex(x => x.PhongBan);
        });
        modelBuilder.Entity<PrintHistory>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.PrintedAt).HasDefaultValueSql("CURRENT_TIMESTAMP").ValueGeneratedOnAdd();
            entity.HasIndex(x => x.PrintedAt);
            entity.HasOne(x => x.Device).WithMany(x => x.PrintHistory).HasForeignKey(x => x.DeviceId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.User).WithMany(x => x.PrintHistory).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<DeviceHistory>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.FieldName).HasMaxLength(30).IsRequired();
            entity.Property(x => x.OldValue).HasMaxLength(255);
            entity.Property(x => x.NewValue).HasMaxLength(255);
            entity.Property(x => x.ChangedAt).HasDefaultValueSql("CURRENT_TIMESTAMP").ValueGeneratedOnAdd();
            entity.HasIndex(x => x.ChangedAt);
            entity.HasIndex(x => x.DeviceId);
            entity.HasOne(x => x.Device).WithMany().HasForeignKey(x => x.DeviceId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
