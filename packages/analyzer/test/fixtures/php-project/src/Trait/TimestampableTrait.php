<?php
declare(strict_types=1);

namespace App\Trait;

trait TimestampableTrait
{
    private \DateTimeImmutable $createdAt;

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }
}
