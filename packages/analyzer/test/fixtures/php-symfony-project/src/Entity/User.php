<?php
namespace App\Entity;
use App\Enum\UserStatus;
use App\Trait\TimestampableTrait;
class User {
    use TimestampableTrait;
    public function __construct(
        private readonly string $name,
        private readonly string $email,
        private UserStatus $status = UserStatus::Active,
    ) {}
    public function getName(): string { return $this->name; }
    public function getEmail(): string { return $this->email; }
    public function getStatus(): UserStatus { return $this->status; }
    public function setStatus(UserStatus $status): void { $this->status = $status; }
}
