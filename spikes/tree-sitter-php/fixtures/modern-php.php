<?php

declare(strict_types=1);

namespace App\Domain\Entity;

use App\Domain\ValueObject\Email;
use App\Domain\Contract\Identifiable;
use App\Domain\Contract\Serializable;

// Enum (PHP 8.1+)
enum Status: string
{
    case Active = 'active';
    case Inactive = 'inactive';
    case Pending = 'pending';

    public function label(): string
    {
        return match ($this) {
            self::Active => 'Active',
            self::Inactive => 'Inactive',
            self::Pending => 'Pending',
        };
    }
}

// Interface
interface Identifiable
{
    public function getId(): int;
}

// Another interface for intersection types
interface Serializable
{
    public function serialize(): string;
}

// Trait
trait TimestampsTrait
{
    private \DateTimeImmutable $createdAt;
    private ?\DateTimeImmutable $updatedAt = null;

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): ?\DateTimeImmutable
    {
        return $this->updatedAt;
    }
}

// Abstract class
abstract class BaseEntity
{
    abstract public function toArray(): array;
}

// Readonly class (PHP 8.2+) with constructor promotion
readonly class UserDto
{
    public function __construct(
        public int $id,
        public string $name,
        public Email $email,
        public Status $status = Status::Active,
    ) {}
}

// Class with union types, intersection types, constructor promotion with readonly
class User extends BaseEntity implements Identifiable, Serializable
{
    use TimestampsTrait;

    public function __construct(
        private readonly int $id,
        private readonly string $name,
        private string|Email $email,
        private Status $status = Status::Active,
    ) {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): int
    {
        return $this->id;
    }

    // Union type return
    public function getEmail(): string|Email
    {
        return $this->email;
    }

    // Intersection type parameter
    public function merge(Identifiable&Serializable $other): void
    {
        // merge logic
    }

    // Nullable return type
    public function findRelated(): ?self
    {
        return null;
    }

    public function serialize(): string
    {
        return json_encode($this->toArray());
    }

    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => (string) $this->email,
            'status' => $this->status->value,
        ];
    }

    // First-class callable syntax (PHP 8.1+)
    public function getSerializer(): \Closure
    {
        return $this->serialize(...);
    }

    // Disjunctive Normal Form types (PHP 8.2+)
    public function process((Identifiable&Serializable)|null $entity): void
    {
        // process
    }

    // Typed class constants (PHP 8.3+)
    public const string TABLE_NAME = 'users';

    // #[Override] attribute (PHP 8.3+)
    #[\Override]
    public function __toString(): string
    {
        return $this->name;
    }
}
