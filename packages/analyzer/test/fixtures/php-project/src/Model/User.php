<?php
declare(strict_types=1);

namespace App\Model;

use App\Enum\UserStatus;
use App\Trait\TimestampableTrait;

class User
{
    use TimestampableTrait;

    public function __construct(
        private readonly int $id,
        private string $name,
        private UserStatus $status = UserStatus::Active,
    ) {}

    public function getId(): int
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getStatus(): UserStatus
    {
        return $this->status;
    }
}
